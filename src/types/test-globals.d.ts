declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare function expect(actual: any): {
    toBe(expected: any): void;
    not: {
        toBe(expected: any): void;
    };
};

