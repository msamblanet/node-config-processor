import { Buffer } from 'node:buffer';
import process from 'node:process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Obfuscator, IObfuscatorConfig } from '@msamblanet/node-obfuscator';
import deepIterator from '@msamblanet/deep-iterator';
import { IConfig, Override, BaseConfigurable } from '@msamblanet/node-config-types';
import extend from 'extend';

export interface ConfigProcessorConfig extends IConfig {
  obfuscator?: IObfuscatorConfig;
}
export type ConfigProcessorConfigOverrides = Override<ConfigProcessorConfig>;

export interface RootConfig extends IConfig {
  configProcessor?: ConfigProcessorConfig;
}
export type RootConfigOverride = Override<RootConfig>;

export class ConfigProcessor<X extends RootConfig> extends BaseConfigurable<X> {
  public static readonly DEFAULT_CONFIG: RootConfig = {
    configProcessor: {}
  };

  public static readonly OP_MATCHER = /^(BOOL|INT|INT16|INT8|RAW|HEXSTR|B64STR|ENV|FILE|OBF|SFILE(\d+)):/;

  protected readonly obfConfig: IObfuscatorConfig;
  protected readonly obfuscator: Obfuscator;

  public constructor(...config: Array<Override<X>>) {
    super(ConfigProcessor.DEFAULT_CONFIG as X, ...config);

    this.obfConfig = this.processObject(extend(true, {}, this.config.configProcessor?.obfuscator));
    this.obfuscator = this.makeObfuscator();
  }

  public process(): X {
    return this.processObject(this.config);
  }

  public obfuscateString(value: string, alg?: string): string {
    return this.obfuscator.encodeString(value, alg);
  }

  protected makeObfuscator(): Obfuscator {
    return new Obfuscator((this.obfConfig as ConfigProcessorConfig).obfuscator);
  }

  protected processObject<Y extends IConfig>(data: Y): Y {
    for (const node of deepIterator(data, { onlyLeaves: true, circularReference: 'leaf' })) {
      if (node.type !== 'String' /* NodeType.String */) {
        continue;
      }

      // Need for any is possibly fixed in unrelease version? see https://github.com/microsoft/TypeScript/pull/44512 and https://github.com/Microsoft/TypeScript/issues/24587
      node.parent[node.key as any] = this.processNode(node.path, node.value as string);
    }

    return data;
  }

  protected ensureSFile(filename: string, numberBytes: number): string {
    if (!fs.existsSync(filename)) {
      const data = crypto.randomBytes(numberBytes).toString('hex');
      fs.writeFileSync(filename, data);
      return data;
    }

    return fs.readFileSync(filename, { encoding: 'utf8' });
  }

  protected processNode(nodeDesc: unknown, valueWithOp: string): unknown {
    if (!valueWithOp) {
      return valueWithOp;
    }

    // Extract operation
    const matches = ConfigProcessor.OP_MATCHER.exec(valueWithOp);
    if (!matches) {
      return valueWithOp;
    } // No prefix - leave it be...

    const value = valueWithOp.slice(matches[0].length);

    if (matches[1].startsWith('SFILE')) {
      return this.ensureSFile(value, Number.parseInt(matches[2], 10));
    }

    switch (matches[1]) {
      case 'RAW': return value;
      case 'HEXSTR': return Buffer.from(value, 'hex').toString('utf8');
      case 'B64STR': return Buffer.from(value, 'base64').toString('utf8');
      case 'ENV': return this.processNode(nodeDesc, process.env[value] ?? '');
      case 'FILE': return this.processNode(nodeDesc, fs.readFileSync(value, { encoding: 'utf8' }));
      case 'BOOL': return this.coherceBool(this.processNode(nodeDesc, value));
      case 'INT': return this.coherceInt(this.processNode(nodeDesc, value), 10);
      case 'INT16': return this.coherceInt(this.processNode(nodeDesc, value), 16);
      case 'INT8': return this.coherceInt(this.processNode(nodeDesc, value), 8);
      case 'OBF':
        if (!this.obfuscator) {
          throw new Error(`Obfuscator not allowed at this time: ${JSON.stringify(nodeDesc)}`);
        }

        return this.obfuscator?.decodeString(value);
        /* istanbul ignore next */
      default: throw new Error(`Unknown op processing config for: ${JSON.stringify(nodeDesc)}`);
    }
  }

  public coherceBool(val: unknown): boolean | null | undefined {
    switch (val) {
      case "":
      case undefined:
        return undefined;
      case null: return null;
      case 1:
      case "1":
      case "true":
      case true:
      case "yes":
        return true;
      default: return false;
    }
  }
  public coherceInt(val: unknown, radix: number): number | null | undefined {
    if (val === undefined || val === "") return undefined;
    if (val === null) return null;
    if (typeof val === "number") return val;
    return parseInt((val as object).toString(), radix);
  }
}

export default ConfigProcessor;
