/* This is needed to allow this to work in ts-node for testing - see: https://github.com/TypeStrong/ts-node#help-my-types-are-missing */
/// <reference types="./@types/msamblanet__deep-iterator" />
import { Obfuscator, ObfuscatorConfigOverrides } from "@msamblanet/node-obfuscator";
//import { NodeType } from "@msamblanet/deep-iterator";
import deepIterator from "@msamblanet/deep-iterator";
import extend from "extend";
import fs from "fs";
import crypto from "crypto";

export type AllOptional<T> = {
    [P in keyof T]?: T[P];
};
export type RecursiveAllOptional<T> = {
    [P in keyof T]?: RecursiveAllOptional<T[P]>;
};

export type Config = Record<string | number | symbol, unknown>

export interface ConfigProcessorConfig extends Config {
    obfuscator?: ObfuscatorConfigOverrides
}
export type ConfigProcessorConfigOverrides = AllOptional<ConfigProcessorConfig>;

export interface RootConfig extends Config {
    configProcessor: ConfigProcessorConfig
}
export type RootConfigOverrides = AllOptional<RootConfig>;

export class ConfigProcessor<X extends RootConfig> {
    public static readonly OP_MATCHER = /^(RAW|HEX|B64|ENV|FILE|OBF|SFILE([0-9]+)):/;
    public static readonly DEFAULT_CONFIG: Config = {}

    private readonly rootConfig: X
    private readonly config: ConfigProcessorConfig
    private readonly obfuscator: Obfuscator

    public constructor(...config: (RootConfigOverrides|null|undefined)[]) {
        this.rootConfig = extend(true, { configProcessor: {} }, ...config);

        const rawConfig = extend(true, {}, ConfigProcessor.DEFAULT_CONFIG, this.rootConfig.configProcessor);
        this.config = this.processObject(rawConfig);

        this.obfuscator = this.getObfuscator();
    }

    public process(): X {
        return this.processObject(this.rootConfig);
    }

    protected getObfuscator(): Obfuscator {
        return new Obfuscator((this.config as ConfigProcessorConfig).obfuscator);
    }

    public obfuscateString(val: string, alg?: string): string {
        return this.obfuscator.encodeString(val, alg);
    }

    protected processObject<Y extends Config>(data: Y): Y {
        for (const node of deepIterator(data, { onlyLeaves: true, circularReference: "leaf" })) {
            if (node.type !== "String" /*NodeType.String*/) continue;
            // Need for any is possibly fixed in unrelease version? see https://github.com/microsoft/TypeScript/pull/44512 and https://github.com/Microsoft/TypeScript/issues/24587
            node.parent[node.key as any] = this.processNode(node.path, node.value as string); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
        return data;
    }

    protected ensureSFile(filename: string, numBytes: number): string {
        if (!fs.existsSync(filename)) {
            const data = crypto.randomBytes(numBytes).toString("hex");
            fs.writeFileSync(filename, data);
            return data;
        }

        return fs.readFileSync(filename, { encoding: "utf8" });
    }

    protected processNode(nodeDesc: unknown, valWithOp: string): unknown {
        if (!valWithOp) return valWithOp;

        // Extract operation
        const matches = valWithOp.match(ConfigProcessor.OP_MATCHER);
        if (!matches) return valWithOp; // No prefix - leave it be...

        const val = valWithOp.substring(matches[0].length);

        if (matches[1].startsWith("SFILE")) return this.ensureSFile(val, parseInt(matches[2]));

        switch (matches[1]) {
            case "RAW": return val;
            case "HEX": return Buffer.from(val, "hex").toString("utf8");
            case "B64": return Buffer.from(val, "base64").toString("utf8");
            case "ENV": return this.processNode(nodeDesc, process.env[val] ?? "");
            case "FILE": return this.processNode(nodeDesc, fs.readFileSync(val, { encoding: "utf8" }));
            case "OBF":
                if (!this.obfuscator) throw new Error(`Obfuscator not allowed at this time: ${JSON.stringify(nodeDesc)}`);
                return this.obfuscator?.decodeString(val);
            /* istanbul ignore next */
            default: throw new Error(`Unknown op processing config for: ${JSON.stringify(nodeDesc)}`);
        }
    }
}

export default ConfigProcessor;
