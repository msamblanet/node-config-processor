import { Buffer } from 'node:buffer';
import process from 'node:process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import objectPath from 'object-path';
import { Obfuscator, IObfuscatorConfig } from '@msamblanet/node-obfuscator';
import deepIterator, { KeyType } from '@msamblanet/deep-iterator';
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

export interface ConfigMappings {
  parent: Record<KeyType, any>;
  key: KeyType;
  source: string;
}

export class ConfigProcessor<X extends RootConfig> extends BaseConfigurable<X> {
  public static readonly DEFAULT_CONFIG: RootConfig = {
    configProcessor: {}
  };

  public static readonly OP_MATCHER = /^(CONFIG|BOOL|INT|INT16|INT8|RAW|HEXSTR|B64STR|ENV|FILE|OBF|SFILE(\d+)):/;

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

  public coherceBool(value: unknown): boolean | null | undefined {
    switch (value) {
      case '':
      case undefined:
        return undefined;
      case null: return null;
      case 1:
      case '1':
      case 'true':
      case true:
      case 'yes':
        return true;
      default: return false;
    }
  }

  public coherceInt(value: unknown, radix: number): number | null | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    return Number.parseInt((value as Record<string, unknown>).toString(), radix); // eslint-disable-line @typescript-eslint/no-base-to-string
  }

  protected makeObfuscator(): Obfuscator {
    return new Obfuscator((this.obfConfig as ConfigProcessorConfig).obfuscator);
  }

  protected processObject<Y extends IConfig>(data: Y): Y {
    const configMappings: ConfigMappings[] = [];

    for (const node of deepIterator(data, { onlyLeaves: true, circularReference: 'leaf' })) {
      if (node.type !== 'String' /* NodeType.String */) {
        continue;
      }

      // Need for any is possibly fixed in unrelease version? see https://github.com/microsoft/TypeScript/pull/44512 and https://github.com/Microsoft/TypeScript/issues/24587
      node.parent[node.key as any] = this.processNode(node.path, node.value as string, configMappings, node.parent);
    }

    for (const mapping of configMappings) {
      mapping.parent[mapping.key as any] = objectPath.get(data, mapping.source); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
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

  protected processNode(nodePath: KeyType[], valueWithOp: string, configMappings?: ConfigMappings[], parent?: Record<KeyType, any>): unknown {
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
      case 'ENV': return this.processNode(nodePath, process.env[value] ?? '');
      case 'FILE': return this.processNode(nodePath, fs.readFileSync(value, { encoding: 'utf8' }));
      case 'BOOL': return this.coherceBool(this.processNode(nodePath, value));
      case 'INT': return this.coherceInt(this.processNode(nodePath, value), 10);
      case 'INT16': return this.coherceInt(this.processNode(nodePath, value), 16);
      case 'INT8': return this.coherceInt(this.processNode(nodePath, value), 8);
      case 'CONFIG': {
        if (!configMappings || !parent) {
          throw new Error(`Cannot use CONFIG in recursed operator: ${JSON.stringify(nodePath)}`);
        }

        configMappings.push({ parent, key: nodePath[nodePath.length - 1], source: value });
        return 'NOT-YET-RESOLVED';
      }

      case 'OBF':
        if (!this.obfuscator) {
          throw new Error(`Obfuscator not allowed at this time: ${JSON.stringify(nodePath)}`);
        }

        return this.obfuscator?.decodeString(value);
        /* istanbul ignore next */
      default: throw new Error(`Unknown op processing config for: ${JSON.stringify(nodePath)}`);
    }
  }
}

export default ConfigProcessor;
