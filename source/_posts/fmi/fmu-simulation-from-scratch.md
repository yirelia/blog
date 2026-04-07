---
title: 从零手搓 FMU 仿真：彻底搞懂 FMI 标准的每一个齿轮
date: 2026-04-06 20:00:00
tags:
  - FMI
  - FMU
  - FMPy
  - 仿真
  - Python
  - 数值积分
categories:
  - 仿真建模
---

本文不依赖任何第三方 FMU 工具包，用纯 Python 手动实现 FMI 2.0 标准的核心机制，从 `modelDescription.xml` 到 `fmi2DoStep` 完整走一遍。然后再用 FMPy 跑同一个模型，逐行对照，让你看清 FMPy "替你做了什么"。读完并跑通代码，你就真正掌握了 FMU 仿真的本质。

<!-- more -->

## 一、FMU 到底是什么

FMU（Functional Mock-up Unit）是 FMI（Functional Mock-up Interface）标准定义的仿真模型封装格式。一句话概括：**FMU 就是一个 `.zip` 压缩包，改了扩展名叫 `.fmu`**。

解压一个 `.fmu` 文件，你会看到这样的目录结构：

```
SpringMassDamper.fmu (ZIP)
├── modelDescription.xml      ← 模型的"身份证"
├── binaries/
│   ├── linux64/model.so      ← Linux 动态库
│   └── win64/model.dll       ← Windows 动态库
├── sources/                  ← (可选) C 源代码
│   └── model.c
└── resources/                ← (可选) 数据文件
    └── lookup_table.csv
```

三个核心组成部分：

`modelDescription.xml` 描述模型有哪些变量、每个变量的编号（valueReference）、类型（input/output/parameter）、初始值。仿真环境靠这个文件"认识"模型。

`binaries/` 存放编译好的动态链接库，实现了 FMI 标准定义的 C 函数接口（`fmi2Instantiate`、`fmi2DoStep` 等）。这是模型的计算核心。

`resources/` 放模型运行需要的额外数据，比如查表文件、配置参数。

FMI 标准的核心设计理念是**模型与仿真环境分离**。不管模型是用 Modelica、Simulink、C 还是 Fortran 写的，只要编译成符合 FMI 接口的 `.dll/.so`，任何仿真环境（FMPy、OpenModelica、MATLAB）都能加载运行。

## 二、valueReference：为什么用整数编号而不是变量名

这是初学 FMI 最容易困惑的设计。先看一个具体的 `modelDescription.xml` 片段：

```xml
<ModelVariables>
  <ScalarVariable name="displacement" valueReference="0"
                  causality="output" variability="continuous">
    <Real start="1.0"/>
  </ScalarVariable>

  <ScalarVariable name="velocity" valueReference="1"
                  causality="output" variability="continuous">
    <Real start="0.0"/>
  </ScalarVariable>

  <ScalarVariable name="force" valueReference="2"
                  causality="input" variability="continuous">
    <Real start="0.0"/>
  </ScalarVariable>

  <ScalarVariable name="mass" valueReference="3"
                  causality="parameter" variability="fixed" initial="exact">
    <Real start="1.0"/>
  </ScalarVariable>
</ModelVariables>
```

FMI 的通信方式分两步。**仿真前**，仿真环境从 XML 里查出 `name → valueReference` 的映射关系。**仿真中**，所有通信只传整数编号。

为什么不直接传字符串？三个原因：

**性能**。仿真循环中每步可能调用几千次 `get/set`，整数比较比字符串匹配快几个数量级。

**跨语言兼容**。C/Fortran/Python/MATLAB 之间传递整数数组几乎零成本，传字符串要处理编码、内存分配、空终止符等一堆问题。

**二进制封装**。编译后的 `.dll` 里根本没有变量名信息，只有内存偏移，整数编号天然对应内存布局。

可以把 `valueReference` 类比为银行账号：`modelDescription.xml` 是开户时的纸质合同（人类可读），`valueReference` 是账号（机器高效），日常转账只认账号。

## 三、fmi2GetReal / fmi2SetReal 参数拆解

这两个函数是 FMI 的"读写总线"，所有变量的存取都通过它们。

### fmi2GetReal 的四个参数

```c
fmi2Status fmi2GetReal(
    fmi2Component  comp,                // 参数1: 模型实例句柄
    const fmi2ValueReference vr[],      // 参数2: 要读哪些变量的编号数组
    size_t         nvr,                 // 参数3: 数组长度
    fmi2Real       values[]             // 参数4: 读出的值放这里（输出）
);
```

具体调用 `fmi2GetReal(comp, [0, 1], 2, values)` 中：

`comp` 是模型实例的句柄（`void*` 指针）。一个 FMU 可以同时创建多个实例（比如仿真 10 个相同的电机），每次调用要指明操作哪个实例。类比打开了多个文件，每个文件有自己的 `FILE*`。

`[0, 1]` 是 `valueReference` 整数数组，列出要读取的变量编号。0 对应 displacement，1 对应 velocity。这些编号从 `modelDescription.xml` 中查得。

`2` 是数组长度。C 语言的数组不携带长度信息，必须额外传入。

`values` 是预先分配的 `double[]` 数组，函数将结果填入。`values[i]` 对应 `vr[i]` 的值，**严格按位置一一对应**。

### fmi2SetReal 不区分 input 和 parameter

`fmi2SetReal` 的参数结构与 `fmi2GetReal` 完全一样，方向反过来。关键点在于：**函数本身不区分 input 和 parameter**。不管你传 `vr=2`（force/input）还是 `vr=3`（mass/parameter），调用的是同一个函数。

区别体现在**什么时候允许你调用**。FMI 标准用生命周期阶段来约束：

| 阶段 | parameter | input |
|------|-----------|-------|
| Instantiation（刚创建） | 不可设置 | 不可设置 |
| Initialization mode（初始化中） | **可以设置（唯一机会）** | 可以设置 |
| Step mode（仿真运行中） | **锁死，不可更改** | 每步都可以更新 |
| Terminated（仿真结束） | 不可设置 | 不可设置 |

parameter 代表物理系统的固有属性（质量、弹簧刚度），仿真开始后不应改变。input 代表外部驱动信号（外力、电压），本来就随时间变化。如果在 step 阶段对 parameter 调用 `fmi2SetReal`，FMU 会返回 `fmi2Error`。

## 四、FMU 的生命周期

FMI 标准定义了严格的生命周期，每个阶段有明确的可操作范围：

```
fmi2Instantiate()
    │
    ▼
fmi2SetupExperiment(startTime, stopTime, tolerance)
    │
    ▼
fmi2EnterInitializationMode()
    │  ← 在这里设置 parameters 和初始状态
    ▼
fmi2ExitInitializationMode()
    │  ← parameters 从此锁死
    ▼
┌─► fmi2SetReal(inputs)        ← 设置当前步的输入
│   fmi2DoStep(t, dt)          ← 推进一步
│   fmi2GetReal(outputs)       ← 读取输出
│   │
│   └── 循环直到仿真结束
│
fmi2Terminate()
    │
    ▼
fmi2FreeInstance()
```

## 五、Co-Simulation vs Model Exchange

FMI 定义了两种仿真模式，核心区别在于**谁负责数值积分**。

### Co-Simulation：求解器在 FMU 内部

仿真环境只需调用 `fmi2DoStep(comp, t, dt)`，FMU 内部自带求解器（比如 RK4），自动完成数值积分。仿真环境不需要知道内部方程。

```
仿真环境 (Host)                   FMU (Slave)
  设置输入 F(t)  ──setReal──→    接收输入
  调用 doStep(dt) ──doStep──→    内部 RK4 积分，推进 dt
  读取输出 x, v  ←──getReal──   返回新的状态
```

### Model Exchange：求解器在外部

FMU 只暴露 `fmi2GetDerivatives()` 返回导数，外部求解器负责积分。控制力更强，精度更可调。

```
仿真环境 (Host)                     FMU (Model)
  setContinuousStates(x,v) ────→   更新内部状态
  getDerivatives()         ←────   返回 dx/dt, dv/dt
  自己做 RK4 积分
  重复
```

怎么选？如果你是"用模型的人"，Co-Simulation 更简单。如果需要精确控制步长或联合多个模型做统一求解，选 Model Exchange。

## 六、动手实践：纯 Python 实现完整 FMU 仿真

下面的代码不依赖任何第三方库，完整实现了 FMI 2.0 的核心接口。我们用弹簧-质量-阻尼器系统作为物理模型。

系统方程 `m·x'' + c·x' + k·x = F(t)` 转化为一阶 ODE 组：`dx/dt = v`，`dv/dt = (F - c·v - k·x) / m`。

### 6.1 modelDescription.xml 的 Python 等价

```python
from dataclasses import dataclass, field
from typing import List, Optional
from xml.etree import ElementTree as ET


@dataclass
class ScalarVariable:
    """对应 XML 中的 <ScalarVariable> 节点"""
    name: str
    value_reference: int
    causality: str = "local"
    variability: str = "continuous"
    initial: Optional[str] = None
    description: str = ""
    start_value: float = 0.0


@dataclass
class ModelDescription:
    """对应 modelDescription.xml 文件"""
    model_name: str = "SpringMassDamper"
    guid: str = "{12345678-abcd-ef01-2345-678901234567}"
    fmi_version: str = "2.0"
    supports_co_simulation: bool = True
    supports_model_exchange: bool = True
    variables: List[ScalarVariable] = field(default_factory=list)

    def to_xml(self) -> str:
        root = ET.Element("fmiModelDescription")
        root.set("fmiVersion", self.fmi_version)
        root.set("modelName", self.model_name)
        root.set("guid", self.guid)
        if self.supports_co_simulation:
            ET.SubElement(root, "CoSimulation").set("modelIdentifier", self.model_name)
        if self.supports_model_exchange:
            ET.SubElement(root, "ModelExchange").set("modelIdentifier", self.model_name)
        mv = ET.SubElement(root, "ModelVariables")
        for var in self.variables:
            sv = ET.SubElement(mv, "ScalarVariable")
            sv.set("name", var.name)
            sv.set("valueReference", str(var.value_reference))
            sv.set("causality", var.causality)
            sv.set("variability", var.variability)
            if var.initial:
                sv.set("initial", var.initial)
            ET.SubElement(sv, "Real").set("start", str(var.start_value))
        ET.indent(root, space="  ")
        return ET.tostring(root, encoding="unicode", xml_declaration=True)


# 定义变量表（和 XML 中的 ScalarVariable 一一对应）
model_desc = ModelDescription()
model_desc.variables = [
    ScalarVariable("displacement", 0, "output", "continuous", start_value=1.0),
    ScalarVariable("velocity",     1, "output", "continuous", start_value=0.0),
    ScalarVariable("force",        2, "input",  "continuous", start_value=0.0),
    ScalarVariable("mass",         3, "parameter", "fixed", initial="exact", start_value=1.0),
    ScalarVariable("damping",      4, "parameter", "fixed", initial="exact", start_value=0.5),
    ScalarVariable("stiffness",    5, "parameter", "fixed", initial="exact", start_value=10.0),
]
```

### 6.2 FMU Instance：用 Python 类模拟 C 动态库

这个类等价于真实 FMU 中编译好的 `.dll/.so` 文件暴露的 C API：

```python
FMI_OK = 0
FMI_ERROR = 3


class FMU_Instance:
    """模拟 FMI 2.0 的 FMU 实例，每个方法对应一个标准 C 函数。"""

    VR_DISPLACEMENT = 0
    VR_VELOCITY     = 1
    VR_FORCE        = 2
    VR_MASS         = 3
    VR_DAMPING      = 4
    VR_STIFFNESS    = 5
    PARAM_VRS = {3, 4, 5}

    def __init__(self, instance_name, guid):
        """对应 fmi2Instantiate()"""
        self.instance_name = instance_name
        self.time = 0.0
        self.x, self.v, self.F = 0.0, 0.0, 0.0
        self.m, self.c, self.k = 1.0, 0.5, 10.0
        self._initialized = False
        self._params_locked = False

    def setup_experiment(self, start_time=0.0, stop_time=None, tolerance=1e-6):
        """对应 fmi2SetupExperiment()"""
        self.time = start_time
        return FMI_OK

    def enter_initialization_mode(self):
        """对应 fmi2EnterInitializationMode()"""
        return FMI_OK

    def exit_initialization_mode(self):
        """对应 fmi2ExitInitializationMode() — parameter 从此锁死"""
        self._initialized = True
        self._params_locked = True
        return FMI_OK

    def set_real(self, vrs, vals):
        """
        对应 fmi2SetReal()
        同一个函数设置任何变量，但 parameter 在初始化完成后拒绝修改。
        """
        for vr, val in zip(vrs, vals):
            if vr in self.PARAM_VRS:
                if self._params_locked:
                    return FMI_ERROR        # parameter 已锁定
                if   vr == 3: self.m = val
                elif vr == 4: self.c = val
                elif vr == 5: self.k = val
            elif vr == 2: self.F = val      # input：随时可写
            elif vr == 0: self.x = val
            elif vr == 1: self.v = val
        return FMI_OK

    def get_real(self, vrs):
        """
        对应 fmi2GetReal()
        返回值数组与 vr 数组按位置一一对应。
        """
        lookup = {0: lambda: self.x, 1: lambda: self.v, 2: lambda: self.F,
                  3: lambda: self.m, 4: lambda: self.c, 5: lambda: self.k}
        return FMI_OK, [lookup[vr]() for vr in vrs]

    def _derivs(self, x, v, F):
        """ODE 右端项。ME 模式下对应 fmi2GetDerivatives()。"""
        return v, (F - self.c * v - self.k * x) / self.m

    def do_step(self, current_time, step_size):
        """
        对应 fmi2DoStep() — Co-Simulation 的核心
        FMU 内部用 RK4 推进一步，仿真环境不需要知道内部方程。
        """
        if not self._initialized:
            return FMI_ERROR
        h = step_size
        x, v, F = self.x, self.v, self.F
        k1x, k1v = self._derivs(x, v, F)
        k2x, k2v = self._derivs(x + .5*h*k1x, v + .5*h*k1v, F)
        k3x, k3v = self._derivs(x + .5*h*k2x, v + .5*h*k2v, F)
        k4x, k4v = self._derivs(x + h*k3x, v + h*k3v, F)
        self.x = x + (h/6)*(k1x + 2*k2x + 2*k3x + k4x)
        self.v = v + (h/6)*(k1v + 2*k2v + 2*k3v + k4v)
        self.time = current_time + step_size
        return FMI_OK

    def get_derivatives(self):
        """对应 fmi2GetDerivatives() — Model Exchange 的核心"""
        dx, dv = self._derivs(self.x, self.v, self.F)
        return FMI_OK, [dx, dv]

    def set_continuous_states(self, states):
        """对应 fmi2SetContinuousStates()"""
        self.x, self.v = states
        return FMI_OK

    def terminate(self):
        """对应 fmi2Terminate()"""
        return FMI_OK

    def free_instance(self):
        """对应 fmi2FreeInstance()"""
        pass
```

### 6.3 Co-Simulation 完整仿真

这段代码模拟了 FMPy 中 `simulate_fmu()` 的核心流程：

```python
import math


def run_cosimulation(x0=1.0, v0=0.0, m=1.0, c=0.5, k=10.0,
                     t_end=10.0, dt=0.01, force_func=None):

    # 阶段 1: 实例化
    fmu = FMU_Instance("smd_cs", model_desc.guid)

    # 阶段 2: 设置实验
    fmu.setup_experiment(0.0, t_end)

    # 阶段 3: 初始化（parameter 只能在这里设置）
    fmu.enter_initialization_mode()
    fmu.set_real([3, 4, 5], [m, c, k])    # parameter — 退出后再也改不了
    fmu.set_real([0, 1], [x0, v0])         # 初始状态
    fmu.exit_initialization_mode()
    # ⚠️ 从这里开始，vr=3,4,5 被锁死

    # 阶段 4: 仿真循环
    results = {"time": [0.0], "x": [x0], "v": [v0]}
    t = 0.0
    while t < t_end - dt * 0.5:
        if force_func:
            fmu.set_real([2], [force_func(t)])  # input：每步都可更新
        fmu.do_step(t, dt)                       # FMU 内部完成积分
        t += dt
        _, [x, v] = fmu.get_real([0, 1])         # 按 vr 位置对应读取
        results["time"].append(round(t, 6))
        results["x"].append(x)
        results["v"].append(v)

    # 阶段 5: 终止
    fmu.terminate()
    fmu.free_instance()
    return results


# 自由振动
r1 = run_cosimulation(x0=1.0, v0=0.0)

# 受迫振动
r2 = run_cosimulation(x0=0.0, force_func=lambda t: 5.0 * math.sin(3.0 * t))

# 验证 parameter 锁定
fmu = FMU_Instance("test", model_desc.guid)
fmu.setup_experiment(0.0, 1.0)
fmu.enter_initialization_mode()
fmu.set_real([3], [2.0])          # 初始化阶段 → OK
fmu.exit_initialization_mode()
status = fmu.set_real([3], [5.0]) # 运行阶段 → ERROR!
print(f"锁定后写 parameter: {'ERROR' if status == FMI_ERROR else 'OK'}")
```

### 6.4 Model Exchange 模式

与 Co-Simulation 的关键区别：不调用 `doStep`，而是通过 `getDerivatives` 获取导数，自己做积分：

```python
def run_model_exchange(x0=1.0, v0=0.0, m=1.0, c=0.5, k=10.0,
                       t_end=10.0, dt=0.01):
    fmu = FMU_Instance("smd_me", model_desc.guid)
    fmu.setup_experiment(0.0, t_end)
    fmu.enter_initialization_mode()
    fmu.set_real([3, 4, 5], [m, c, k])
    fmu.set_real([0, 1], [x0, v0])
    fmu.exit_initialization_mode()

    states = [x0, v0]
    t = 0.0
    while t < t_end - dt * 0.5:
        h = dt
        # 外部 RK4：每步向 FMU 请求 4 次导数
        fmu.set_continuous_states(states)
        _, k1 = fmu.get_derivatives()
        fmu.set_continuous_states([s + .5*h*d for s, d in zip(states, k1)])
        _, k2 = fmu.get_derivatives()
        fmu.set_continuous_states([s + .5*h*d for s, d in zip(states, k2)])
        _, k3 = fmu.get_derivatives()
        fmu.set_continuous_states([s + h*d for s, d in zip(states, k3)])
        _, k4 = fmu.get_derivatives()
        for i in range(2):
            states[i] += (h/6)*(k1[i] + 2*k2[i] + 2*k3[i] + k4[i])
        fmu.set_continuous_states(states)
        t += dt

    fmu.terminate()
    fmu.free_instance()
    return states
```

### 6.5 解析解验证

```python
m, c, k = 1.0, 0.5, 10.0
omega_n = math.sqrt(k / m)                  # 固有频率
zeta = c / (2 * math.sqrt(k * m))           # 阻尼比
omega_d = omega_n * math.sqrt(1 - zeta**2)  # 阻尼固有频率

max_err = 0.0
for i, t in enumerate(r1["time"]):
    x_exact = math.exp(-zeta * omega_n * t) * (
        math.cos(omega_d * t)
        + (zeta * omega_n / omega_d) * math.sin(omega_d * t)
    )
    max_err = max(max_err, abs(r1["x"][i] - x_exact))

print(f"ωn={omega_n:.4f} rad/s, ζ={zeta:.4f}")
print(f"RK4 (dt=0.01s) 最大误差: {max_err:.2e} m")
# 输出: 3.88e-08 m
```

## 七、FMPy 真实流程：与手搓版逐行对照

安装 FMPy 后（`pip install fmpy`），用内置的 BouncingBall 测试 FMU 来演示。这个 FMU 的变量表：vr=0 `h`（高度/output）、vr=1 `v`（速度/output）、vr=2 `g`（重力/parameter）、vr=3 `e`（恢复系数/parameter）。

### 7.1 Level 1：一行搞定

```python
from fmpy import simulate_fmu

result = simulate_fmu(
    filename='BouncingBall.fmu',
    start_time=0.0,               # → fmi2SetupExperiment
    stop_time=3.0,
    output_interval=0.01,         # → 仿真循环的 dt
    start_values={                # → 初始化阶段 fmi2SetReal
        'h': 1.0,
        'e': 0.7,
    },
    output=['h', 'v'],            # → 每步 doStep 后 fmi2GetReal
)
# result 是 numpy structured array
# result['time'], result['h'], result['v']
```

这一行背后，FMPy 执行了手搓代码中的**全部生命周期步骤**。

### 7.2 Level 2：手动控制生命周期

这一层完全等价于手搓版的 `run_cosimulation()` 函数。下面用注释标注对应关系：

```python
from fmpy import read_model_description, extract
from fmpy.fmi2 import FMU2Slave
import shutil

# 解析 XML（手搓版: ModelDescription + ScalarVariable）
md = read_model_description('BouncingBall.fmu')
vr_map = {v.name: v.valueReference for v in md.modelVariables}

# 解压 FMU（手搓版跳过了这步）
unzipdir = extract('BouncingBall.fmu')

# 创建实例 + 加载动态库（手搓版: FMU_Instance.__init__()）
fmu = FMU2Slave(
    guid=md.guid,
    unzipDirectory=unzipdir,
    modelIdentifier=md.coSimulation.modelIdentifier,
)
# 内部: ctypes.cdll.LoadLibrary("binaries/.../BouncingBall.so")

fmu.instantiate()                             # → fmi2Instantiate()
fmu.setupExperiment(startTime=0.0, stopTime=3.0)  # → fmi2SetupExperiment()
fmu.enterInitializationMode()                 # → fmi2EnterInitializationMode()

# 设置 parameter（手搓版: fmu.set_real([3,4,5], [m,c,k])）
fmu.setReal([vr_map['e']], [0.7])             # 恢复系数 e=0.7
fmu.setReal([vr_map['h']], [1.0])             # 初始高度 h=1.0

fmu.exitInitializationMode()                  # → parameter 锁死

# 仿真循环（手搓版: while t < t_end）
t, dt = 0.0, 0.01
while t < 3.0 - dt * 0.5:
    fmu.doStep(currentCommunicationPoint=t, communicationStepSize=dt)
    t += dt
    h = fmu.getReal([vr_map['h']])[0]         # 按 vr 读取
    v = fmu.getReal([vr_map['v']])[0]

fmu.terminate()                               # → fmi2Terminate()
fmu.freeInstance()                             # → fmi2FreeInstance()
shutil.rmtree(unzipdir, ignore_errors=True)   # 清理解压目录
```

### 7.3 Level 3：ctypes 底层

FMPy 的 `fmu.getReal([0, 1])` 背后实际发生了什么：

```python
import ctypes

# 1. Python list → ctypes 数组
vr_array = (ctypes.c_uint32 * 2)(0, 1)
values   = (ctypes.c_double * 2)()

# 2. 调用 C 函数（动态库函数指针）
status = dll.fmi2GetReal(
    comp,        # void* 模型实例句柄
    vr_array,    # const unsigned int vr[]
    2,           # size_t nvr
    values,      # double values[]（输出）
)

# 3. ctypes 数组 → Python list
result = [values[0], values[1]]
```

这就是 FMPy 做的全部"魔法"——把 Python 对象转成 C 类型，调一个函数指针，再把结果转回来。

## 八、两种方式完整对照

| 操作 | 手搓版 | FMPy Level 2 | 底层 C 调用 |
|------|--------|-------------|------------|
| 解压 FMU | 跳过 | `extract(path)` | — |
| 解析 XML | `ModelDescription` 类 | `read_model_description()` | — |
| 加载动态库 | Python 类模拟 | `FMU2Slave()` | `ctypes.cdll.LoadLibrary` |
| 创建实例 | `FMU_Instance()` | `fmu.instantiate()` | `fmi2Instantiate()` |
| 设置实验 | `setup_experiment()` | `fmu.setupExperiment()` | `fmi2SetupExperiment()` |
| 进入初始化 | `enter_initialization_mode()` | `fmu.enterInitializationMode()` | `fmi2EnterInitializationMode()` |
| 设置变量 | `set_real([vr],[val])` | `fmu.setReal([vr],[val])` | `fmi2SetReal(comp,vr[],nvr,val[])` |
| 退出初始化 | `exit_initialization_mode()` | `fmu.exitInitializationMode()` | `fmi2ExitInitializationMode()` |
| 推进一步 | `do_step(t,dt)` | `fmu.doStep(t,dt)` | `fmi2DoStep(comp,t,dt,true)` |
| 读取变量 | `get_real([vr])` | `fmu.getReal([vr])` | `fmi2GetReal(comp,vr[],nvr,val[])` |
| 终止 | `terminate()` | `fmu.terminate()` | `fmi2Terminate()` |
| 释放 | `free_instance()` | `fmu.freeInstance()` | `fmi2FreeInstance()` |

**每一行的调用序列完全相同。** FMPy 只是加了一层 ctypes 胶水。

## 九、信息流全景图

```
你的代码                    FMPy 内部                    FMU (.dll/.so)
─────────                  ──────────                   ─────────────
                           解压 .fmu (ZIP)
                           解析 XML → vr 映射表
                           ctypes.LoadLibrary()
                                │
simulate_fmu(...)          ─────┤
  或                            │
fmu.instantiate()    ──→  ctypes 调用  ──→  fmi2Instantiate()     → 分配内存
fmu.setupExperiment  ──→  ctypes 调用  ──→  fmi2SetupExperiment() → 设时间范围
fmu.enterInitMode    ──→  ctypes 调用  ──→  fmi2EnterInitMode()
fmu.setReal([3],[v]) ──→  ctypes 调用  ──→  fmi2SetReal()         → 写 parameter
fmu.exitInitMode     ──→  ctypes 调用  ──→  fmi2ExitInitMode()    → 锁 parameter
│                                                                    │
├─loop────────────────────────────────────────────────────────────────┤
│ fmu.setReal([2],[F]) → ctypes → fmi2SetReal()   → 写 input        │
│ fmu.doStep(t, dt)    → ctypes → fmi2DoStep()    → 内部积分         │
│ fmu.getReal([0,1])   → ctypes → fmi2GetReal()   → 读 output       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
fmu.terminate()      ──→  ctypes 调用  ──→  fmi2Terminate()
fmu.freeInstance()   ──→  ctypes 调用  ──→  fmi2FreeInstance()    → 释放内存
                           清理临时目录
```

## 十、核心要点速查

| 概念 | 一句话 |
|------|--------|
| FMU | ZIP 压缩包 = XML 描述 + 编译好的动态库 + 资源文件 |
| valueReference | 变量的整数编号，从 XML 查名称映射，仿真中只传编号 |
| fmi2GetReal | 按编号批量读变量，`vr[]` 和 `values[]` 按位置对应 |
| fmi2SetReal | 按编号批量写变量，函数不区分 input/parameter，生命周期区分 |
| parameter | 只能在初始化阶段设置，`ExitInitializationMode` 后永久锁死 |
| input | 初始化和仿真循环中都可更新，每步 doStep 前设置 |
| Co-Simulation | FMU 内含求解器，调 `doStep(dt)` 即可 |
| Model Exchange | FMU 只给导数 `getDerivatives()`，你自己积分 |
| 生命周期 | Instantiate → Setup → Init → [Step]* → Terminate → Free |
| FMPy | 一层 ctypes 胶水 = 解压 + 解析 XML + 加载 .dll + C 类型转换 |

## 十一、可以动手的实验

1. 改变 `x0`、`v0` 观察不同初始条件下的响应曲线
2. 调大 `c`，让阻尼比 `ζ > 1`，观察过阻尼行为（无振荡单调衰减）
3. 设 `c = 2*sqrt(k*m)` 达到临界阻尼，对比欠阻尼和过阻尼
4. 换不同的 `force_func` 看阶跃响应、方波响应、随机激励
5. 改变 `dt` 从 0.1 到 0.0001，观察步长对 RK4 精度的影响
6. 把 RK4 替换为 Euler 法 `x += dt * dx`，对比误差量级差了多少
7. 在 `exit_initialization_mode` 之后尝试 `set_real` 一个 parameter 的 vr，验证锁定报错
