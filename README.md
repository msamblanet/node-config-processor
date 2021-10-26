# Node Config Processor
[![npm version](https://badge.fury.io/js/@msamblanet%2Fnode-config-processor.svg)](https://badge.fury.io/js/@msamblanet%2Fnode-config-processor)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

This repository is part of a collection of my personal node.js libraries and templates.  I am making them available to the public - feel free to offer suggestions, report issues, or make PRs via GitHub.

This project is a utility to process a configuration file to allow for basic templating, including obfuscation and loading variables from the environment.  Note that the system does NOT require the use of any specific configuration system.

## Operations

Each string value in a config object is evaluated and processed.  Prefix values are evaluated to check for processing.

- ```RAW:``` indicates that the remainder of the string should be used unaltered.  Useful if your value starts with the same value as one of these prefixes.
- ```HEXSTR:``` indicates that the remainder of the string is a hex encoded UTF8 string.  The decoded value is used raw and NOT recursively processed.
- ```B64STR:``` indicates that the remainder of the string is a base64 encoded UTF8 string.  The decoded value is used raw and NOT recursively processed.
- ```ENV:``` indicates that the value should be pulled from the environment.  The value is recursively processed, allowing it to be a ```FILE:``` for example.
- ```BOOL:``` indicates that the value should be converted to a boolean.  The value is recursively processed.
- ```INT:``` indicates that the value should be converted to an integer.  Strings are converted as base-10.  The value is recursively processed.
- ```INT16:``` indicates that the value should be converted to an integer.  Strings are converted as base-16.  The value is recursively processed.
- ```INT8:``` indicates that the value should be converted to an integer.  Strings are converted as base-8.  The value is recursively processed.
- ```FILE:``` indicates that the value should be read from a file.  The value is recursively processed.
- ```SFILE##:``` indicates that the value should be read from a file but if the file does not exist, a ## byte random hex value will be written to the file.  Useful to allow applications to create random tokens on first startup.
    - ie: ```SFILE8:/home/app/.myapp/.admin.password``` would read the value from this file or generate an 8-byte (16 character) hex value.
- ```OBF:``` indicates that the value is obfuscated.  The decoded value is used raw and NOT recursively processed.

## Recommended Usage

The following example shows using this module for configuring a main application using ```dotenv``` an ```config```.  Other modules can be used and other patterns are psosible.

Setup:

```bash
# For main applications
npm install @msamblanet/node-config-processor config json5 js-yaml dotenv extend
npm install --save-dev @types/extend

# For modules
npm install extend
npm install --save-dev @msamblanet/node-config-processor @types/extend
```

```typescript
// moduleConfig.ts
import dotenv from 'dotenv';
dotenv.config();

import type { Config } from "@msamblanet/node-config-processor";
import nodeConfig from "config";
import ConfigProcessor from "@msamblanet/node-config-processor";

export interface ModuleConfig extends Config {
    a: number,
    b: number
};

export const config = new ConfigProcessor<ModuleConfig>(nodeConfig).process();
export default config;

// main.ts
import config from "./moduleConfig"

import Foo from "./Foo";
const foo = new Foo(config.foo);

console.log(foo.doStuff());

// Or if you need programatic injection also...later configs take precidence over earlier ones
const foo2 = new Foo(config.foo, { b: 30127 });
console.log(foo2.doStuff());
```

```typescript
// Foo.ts
import extend from "extend";
import type { Config, AllOptional } from "@msamblanet/node-config-processor";

export interface FooConfig extends Config {
    a: number;
    b: number;
}
// Note: If you have deep structure and you need it all optional on overides, use RecursiveAllOptional instead
export type FooConfigOverrides = AllOptional<FooConfig>;

export class Foo {
    public static readonly DEFAULT_CONFIG: FooConfig = {
        a: 1,
        b: 2
    }
    protected readonly config: FooConfig

    public constructor(...config: (FooConfigOverrides|null|undefined)[]) {
        this.config = extend(true, {}, Foo.DEFAULT_CONFIG, ...config);
    }

    public doStuff() {
        return config.a + config.b;
    }
}
export default Foo;
```

```yaml
# ./config/default.yaml
foo
    a: 42
    b: 64767

# ./config/development.yaml
configProcessor
    obfuscator
        defaultAlg: DEV21
        algSettings:
            DEV21:
                name: DEV21
                base: DEFAULT
                password: ENV:DEV21_OBF_PASSWORD

# ./config/production.yaml
configProcessor
    obfuscator
        defaultAlg: PROD21
        algSettings:
            PROD21:
                name: PROD21
                base: DEFAULT
                password: ENV:PROD21_OBF_PASSWORD
```

### Recommended package

## API (core)

### ConfigProcessor(data)

Constructs the config processor.  ```data``` is the configuration to process.  Note that ```data``` will be modified IN-PLACE when process() is called.

### ConfigProcessor.process()

Processes the data passed into the constructor, returning the config object for chaining.  Note that the object is modified IN-PLACE and is NOT cloned.

### ConfigProcessor.obfuscateString(val, alg)

Obfuscates ```val``` using the configured obfucator.  If ```alg``` is specified, it is used as the obfuscaion alogrithm.

## API (extensions)

The following methods are intended for extending/customizing the module if needed.  Subclass before using the config...

### ConfigProcessor.processConfig()

Method to pre-process the config.  The default implementation performs the full object processing, but does not allow the obfuscator to be used because it requires initialization from the config object.

The config to process can be found in ```this.config``` and it should be processed in-place.

### ConfigProcessor.getObfuscator(): Obfuscator

Constructs an Obfuscator object to be used.  Default implementation establishes a ```@msamblanet/node-obfuscator``` object using the configuration under ```configProcessor.obfuscator``` in the source data.

### ConfigProcessor.processObject(data): any

Walks the ```data``` object and processes all of nodes.  The default implementation uses ```deep-iterator``` to walk the tree and replaces the value with the value returned by ```processNode```.

### ConfigProcessor.processNode(nodeDesc, val): any

Processes a value for a single node.  ```nodeDesc``` is a description of the node.  If any errors are thrown, it should be stringified and used to display the context.
