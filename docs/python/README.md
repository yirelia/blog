## 脚本语言可参考 python [cookBook](https://python3-cookbook.readthedocs.io/zh_CN/latest/preface.html)

## 其他图片格式转JPG
```python
# python3
from PIL import Image
import os

JPEG = 'JPEG'

original_picture_dir = r'C:\Users\Administrator\Desktop\not-jpg'
dst_picture_dir = r'C:\Users\Administrator\Desktop\jpg'


def convert():
    for original_img_name in (name for name in os.listdir(original_picture_dir)):
        original_img_path = os.path.join(original_picture_dir, original_img_name)
        try:
            with Image.open(original_img_path) as img:
                img.save(os.path.join(dst_picture_dir, original_img_name))
        except OSError:
            print(OSError)


if __name__ == '__main__':
    convert()
```

## python 通过多线程下载，生产者以及消费者模式
```python
# python3
from threading import Thread
from queue import Queue, Empty


target_queue = Queue(maxsize=10000)


def connect_mongo(target_queue):
    conn = MongoClient('mongodb://root:example@10.10.10.236:27017')
    db = conn.edge_cloud
    edge_node_event = db.edgeNodeEvent
    # 只查询车辆抓拍, id：5-15
    event_query = {"eventType": "TANK_CAPT",
                   "timestamp": {"$gt": 1641276600,
                                 "$lte": 1641547200},
                   "cameraId": {"$in": ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]},
                   "targets.extra": {"$ne": ""}
                   }
    # result_field = {"sceneImageUrl": 1, "cameraId": 1, "timestamp": 1}  # 只返回图片字段
    result_field = {}  # 只返回图片字段
    count = 0
    for item in edge_node_event.find(event_query, result_field).sort("timestamp"):
        count += 1
        if 'targets' in item and len(item['targets']):
            data = dict(
                targets=item['targets'],
                cameraId=item['cameraId']
            )
            # target = item['targets'][0]
            # target['sceneImageUrl'] = item['sceneImageUrl']
            # target['cameraId'] = item['cameraId']
            target_queue.put(data)
    print('total count', count)
    # target_queue.put()

def download_file(target_queue):
    while True:
        try:
            data = target_queue.get(timeout=10)
            cameraId = data['cameraId']
            extra_key = 'extra'
            .....
        except Empty as emptyException:
            break


if __name__ == '__main__':
    producer = Thread(target=connect_mongo, name='connect_mongo', args=(target_queue,))

    producer.start()
    cm1 = Thread(target=download_file, name='download_file', args=(target_queue,))
    cm1.start()

```