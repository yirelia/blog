export class MinPQ {

    // constructor() {}

    // constructor(capacity: number) {}


}

export interface Comparable {
    compareTo(that: Comparable): number;

    /**
     * @description: greater than
     * @return {*}
     */    
    greater(that:Comparable): boolean

    /**
     * @description: 
     * @return {*}
     */    
    less(that:Comparable): boolean

}

export class MaxPQ<T extends Comparable> {
    private n: number = 0;
    private pq: T[] = []; // 优先队列
    constructor(capacity: number) {
        this.pq = new Array(capacity + 1);
        console.log(this.pq)

    }

    public insert(v: T): void {
        this.pq[++this.n] = v;
        this.swim(this.n);
    }

    public max(): T {
        return null as any;
    }

    public delMax(): T {
        return null as any;
    }

    public isEmpty(): boolean {
        return false
    }

    public size(): number {
        return 0
    }

    public swim(k: number): void {
        while(k > 1 && ) {}
    }


    public exch(i: number, j: number): void {
        const t = this.pq[i];
        this.pq[i] = this.pq[j];
        this.pq[j] = t;
    }

    // public g

}

const maxPQ = new MaxPQ(10);