# Node Config Processor
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

This repository is part of a collection of my personal node.js libraries and templates.  I am making them available to the public - feel free to offer suggestions, report issues, or make PRs via GitHub.

This project is a utility to process a configuration file to allow for basic templating, including obfuscation and loading variables from the environment.  Note that the system does NOT require the use of any specific configuration system.

## Operations

Each string value in a config object is evaluated and processed.  Prefix values are evaluated to check for processing.

- ```RAW:``` indicates that the remainder of the string should be used unaltered.  Useful if your value starts with the same value as one of these prefixes.
- ```HEX:``` indicates that the remainder of the string is a hex encoded UTF8 string.  The decoded value is used raw and NOT recursively processed.
- ```B64:``` indicates that the remainder of the string is a base64 encoded UTF8 string.  The decoded value is used raw and NOT recursively processed.
- ```ENV:``` indicates that the value should be pulled from the environment.  The value is recursively processed, allowing it to be a ```FILE:``` for example.
- ```FILE:``` indicates that the value should be read from a file.  The value is recursively processed.
- ```OBF:``` indicates that the value is obfuscated.  The decoded value is used raw and NOT recursively processed.

## Usage

```
npm install @msamblanet/node-config-processor

# The following are optional
npm install config json5 js-yaml
```

```
require ConfigProcessor from "@msamblanet/node-config-processor";
require config from "config";

const new ConfigProcessor(config).process();
```

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
