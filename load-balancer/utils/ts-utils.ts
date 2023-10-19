//
// https://medium.com/@islizeqiang/unlocking-the-magic-of-infer-in-typescript-571d4082bc80
// 


/**
 * utility type that leverages the infer keyword is Parameters. 
 * This type extracts the parameter types of a function as a tuple
 */
export type ParametersType<T extends (...args: any[]) => any> = T extends (...args: infer P) => any ? P : never;

/**
 * ReturnType is a utility type that extracts the return type of a function. 
 * It's a perfect example of how the infer keyword can be used to create dynamic types.
 */
export type ReturnType<T extends (...args: any[]) => any> = T extends (...args: any[]) => infer R ? R : any;

/**
 * The PromiseType utility type can be used to extract the type that a Promise resolves to. 
 * This is particularly useful when dealing with asynchronous functions. 
 */
export type PromiseType<T extends Promise<any>> = T extends Promise<infer U> ? U : never;

/**
 * The UnboxArray utility type can be used to extract the type of the elements within an array.
 */
export type UnboxArray<T extends Array<any>> = T extends Array<infer U> ? U : never;

/**
 * utility type called IfFunction, which evaluates whether a type is a function or not. If it is, 
 * we want to extract the return type of the function. 
 * 
 * If not, we want to return the original type. 
 * We can achieve this using infer and conditional types
 */
export type IfFunction<T> = T extends (...args: any[]) => any ? ReturnType<T> : T;

/**
 * Mapped types allow developers to create new types by transforming the properties of an existing type. 
 * Combining infer with mapped types allows for more complex type transformations.
 * 
 *  type OriginalObject = {
 *    a: string;
 *    b: number;
 *    c: () => boolean;
 *  };
 *  
 *  type FunctionifiedObject = Functionify<OriginalObject>;
 *  # FunctionifiedObject is inferred as:
 *  # {
 *  #   a: () => string;
 *  #   b: () => number;
 *  #   c: () => boolean;
 *  # }
 */
export type Functionify<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : () => T[K];
  };
