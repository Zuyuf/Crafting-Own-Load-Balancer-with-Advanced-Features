import { exec } from "child_process";
import { promisify } from "node:util";

const promisifiedExec = promisify(exec);

//

export async function ExecCMD(command: string) {
    try {
        console.log(`ExecCMD - running command => ${command}`);
        const { stderr, stdout } = await promisifiedExec(command);

        console.log(`[ExecCMD-stdout] => ${stdout}`);
        console.log(`[ExecCMD-stderr] => ${stderr}`);

        return { stdout, stderr };
    }
    catch (error) {
        console.log('[ExecCMD-ERROR] Command failed to run with error: ', error);
        throw error;
    }
}
