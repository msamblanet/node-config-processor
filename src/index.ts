/* This is needed to allow this to work in ts-node for testing - see: https://github.com/TypeStrong/ts-node#help-my-types-are-missing */
/// <reference types="./@types/msamblanet__deep-iterator" />
import { Obfuscator, ObfuscatorConfig } from "@msamblanet/node-obfuscator";
import { KeyType, NodeType } from "@msamblanet/deep-iterator";
import deepIterator from "@msamblanet/deep-iterator";
import extend from "extend";
import fs from "fs";

// https://stackoverflow.com/questions/41980195/recursive-partialt-in-typescript
export type RecursivePartial<T> = {
    [P in keyof T]?: RecursivePartial<T[P]>;
};

export interface RootConfig extends Record<KeyType, unknown> {
    configProcessor?: ConfigProcessorConfig
}

export interface ConfigProcessorConfig extends Record<KeyType, unknown> {
    obfuscator?: RecursivePartial<ObfuscatorConfig>
}

export class ConfigProcessor<X extends RootConfig> {
    static readonly OP_MATCHER = /^(RAW|HEX|B64|ENV|FILE|OBF):/;
    static readonly DEFAULT_CONFIG: ConfigProcessorConfig = {}

    readonly data: X
    readonly config: ConfigProcessorConfig
    readonly obfuscator: Obfuscator

    constructor(data: X) {
        this.data = data;

        this.config = extend(true, {}, ConfigProcessor.DEFAULT_CONFIG, data.configProcessor);
        this.processConfig();

        this.obfuscator = this.getObfuscator();
    }

    processConfig(): void {
        this.processObject(this.config);
    }

    getObfuscator(): Obfuscator {
        return new Obfuscator((this.config as ConfigProcessorConfig).obfuscator);
    }

    obfuscateString(val: string, alg?: string): string {
        return this.obfuscator.encodeString(val, alg);
    }

    process(): X {
        return this.processObject(this.data) as X;
    }

    processObject<X extends Record<KeyType, unknown>>(data: X): X {
        for (const node of deepIterator(data, { onlyLeaves: true, circularReference: "leaf" })) {
            if (node.type !== NodeType.String) continue;
            (node.parent as any)[node.key] = this.processNode(node.path, node.value as string); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
        return data;
    }

    processNode(nodeDesc: unknown, val: string): unknown {
        if (!val) return val;

        // Extract operation
        const matches = val.match(ConfigProcessor.OP_MATCHER);
        if (!matches) return val; // No prefix - leave it be...

        switch (matches[1]) {
            case "RAW": return val;
            case "HEX": return Buffer.from(val, "hex").toString("utf8");
            case "B64": return Buffer.from(val, "base64").toString("utf8");
            case "ENV": return this.processNode(nodeDesc, process.env[val] ?? "");
            case "FILE": return this.processNode(nodeDesc, fs.readFileSync(val, { encoding: "utf8" }) ?? "");
            case "OBF":
                if (!this.obfuscator) throw new Error(`Obfuscator not allowed at this time: ${JSON.stringify(nodeDesc)}`);
                return this.obfuscator?.decodeString(val);
            default: /* istanbul ignore next */ throw new Error(`Unknown op processing config for: ${JSON.stringify(nodeDesc)}`);
        }
    }
}

export default ConfigProcessor;
