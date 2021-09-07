/* This is needed to allow this to work in ts-node for testing - see: https://github.com/TypeStrong/ts-node#help-my-types-are-missing */
/// <reference types="./@types/msamblanet__deep-iterator" />
import { Obfuscator, ObfuscatorConfigOverride } from "@msamblanet/node-obfuscator";
import deepIterator from "@msamblanet/deep-iterator";
import { Config, Override, BaseConfigurable } from "@msamblanet/node-config-types";
import fs from "fs";
import crypto from "crypto";
import extend from "extend";

export interface ConfigProcessorConfig extends Config {
    obfuscator?: ObfuscatorConfigOverride
}
export type ConfigProcessorConfigOverrides = Override<ConfigProcessorConfig>;

export interface RootConfig extends Config {
    configProcessor: ConfigProcessorConfig
}
export type RootConfigOverride = Override<RootConfig>;

export class ConfigProcessor<X extends RootConfig> extends BaseConfigurable<X> {
    public static readonly OP_MATCHER = /^(RAW|HEX|B64|ENV|FILE|OBF|SFILE([0-9]+)):/;
    public static readonly DEFAULT_CONFIG: RootConfig = { configProcessor: {} }

    protected obfConfig: ObfuscatorConfigOverride
    protected obfuscator: Obfuscator

    public constructor(...config: RootConfigOverride[]) {
        super(ConfigProcessor.DEFAULT_CONFIG as X, ...config);

        this.obfConfig = this.processObject(extend(true, {}, this.config.configProcessor.obfuscator));
        this.obfuscator = this.makeObfuscator();
    }

    public process(): X {
        return this.processObject(this.config);
    }

    protected makeObfuscator(): Obfuscator {
        return new Obfuscator((this.obfConfig as ConfigProcessorConfig).obfuscator);
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
