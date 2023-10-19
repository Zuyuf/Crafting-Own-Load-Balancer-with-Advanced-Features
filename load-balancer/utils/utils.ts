import { ParametersType, ReturnType } from "./ts-utils";

const promisify = function <IFn extends (...args: any[]) => any>(fn: IFn) {
    type IArgs = ParametersType<typeof fn>;
    type IReturnType = ReturnType<typeof fn>;

    return (...args: IArgs): Promise<IReturnType> =>
      new Promise((resolve, reject) => {
        fn(...args, (err, result: IReturnType) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
}

export const Utils = {
    promisify
};
