// Must import mocks before any modules imported
/* eslint-disable import/first,import/order,node/no-unsupported-features/es-syntax */
import { jest } from '@jest/globals'; // eslint-disable-line import/no-extraneous-dependencies
import MockFs from './MockFs.js';
import MockRandom from './MockRandom.js';

const mockFs = new MockFs(jest);
const mockRandom = new MockRandom(jest);

// Must import any types you need because we can't load types with await import...
import type { RootConfig, RootConfigOverride } from '../src/index.js';

// To ensure mocks are honored, must await import the remainder
const { default: process } = await import('node:process');
const { default: fs } = await import('node:fs');
const { Obfuscator } = await import('@msamblanet/node-obfuscator');
const Lib = await import('../src/index.js');

test('Check Exports', () => {
  expect(true).toBeTruthy();
});

const obf = new Obfuscator();
const rawString1 = 'ObfStr1';
const obfString1 = obf.encodeString(rawString1);

const baseDir = '/__UNIT__TESTS__';
beforeAll(() => {
  mockFs.populate(
    {
      'test-file/a.txt': 'ABCDE',
    },
    baseDir
  );
});

afterAll(() => {
  mockFs.reset();
});

test('Check Exports', () => {
  expect(Lib).not.toBeNull();
  expect(Lib.ConfigProcessor).not.toBeNull();

  // expect(LibDefault).toEqual(Lib.ConfigProcessor);
});

test('Check Basics', () => {
  process.env.unittest_env_1 = '98765';
  process.env.unittest_env_2 = `OBF:${obfString1}`;

  interface TestRootConfig extends RootConfig {
    a: string;
    b: boolean;
    c: unknown;
    d: null | string;
    e: [number, string, string | undefined, string | null, boolean];
    f: string;
    g: string;
    h: string;
    i: string;
    j: string;
    k: string;
    l: string;
    m: string;
    n: string;
  }

  const t = new Lib.ConfigProcessor<TestRootConfig>({
    a: 'ABCDE',
    b: true,
    c: undefined,
    d: null,
    e: [1, 'A', undefined, null, true],
    f: 'RAW:ABCDE',
    g: 'HEXSTR:5758595A', // WXYZ
    h: 'B64STR:TU5PUA==', // MNOP
    i: 'ENV:unittest_env_1', // 98765
    j: `OBF:${obfString1}`,
    k: 'ABC:DEF:GHI',
    l: 'RAW:',
    m: 'ENV:unittest_env_doesnotexist',
    n: 'ENV:unittest_env_2'
  });
  const cfg = t.process();

  expect(cfg).not.toBeNull();
  expect(cfg.a).toEqual('ABCDE');
  expect(cfg.b).toEqual(true);
  expect(cfg.c).toEqual(undefined);
  expect(cfg.d).toEqual(null);
  expect(cfg.e).toEqual([1, 'A', undefined, null, true]);
  expect(cfg.f).toEqual('ABCDE');
  expect(cfg.g).toEqual('WXYZ');
  expect(cfg.h).toEqual('MNOP');
  expect(cfg.i).toEqual('98765');
  expect(cfg.j).toEqual(rawString1);
  expect(cfg.k).toEqual('ABC:DEF:GHI');
  expect(cfg.l).toEqual('');
  expect(cfg.m).toEqual('');
  expect(cfg.n).toEqual(rawString1);
});

test('Check Obfuscate String', () => {
  const t = new Lib.ConfigProcessor();
  const t2 = t.obfuscateString('ABCDE');
  const t3 = t.obfuscateString('FGHIJ', Obfuscator.DEFAULT_CONFIG.defaultAlg);

  interface TestRootConfig extends RootConfig {
    a: string;
    b: string;
  }

  const t4 = new Lib.ConfigProcessor<TestRootConfig>({ a: `OBF:${t2}`, b: `OBF:${t3}` });
  const cfg = t4.process();

  expect(cfg).toMatchObject({ a: 'ABCDE', b: 'FGHIJ' });
});

test('No obfuscation in processor config', () => {
  const cfg: RootConfigOverride = {
    configProcessor: {
      obfuscator: {
        defaultAlg: `OBF:${obfString1}`
      }
    }
  };
  expect(() => new Lib.ConfigProcessor(cfg)).toThrowError('Obfuscator not allowed at this time: ');
});

test('Verify FILE', () => {
  interface TestRootConfig extends RootConfig {
    a: string;
  }

  const cfg = new Lib.ConfigProcessor<TestRootConfig>({
    a: `FILE:${baseDir}/test-file/a.txt`
  }).process();

  expect(cfg.a).toEqual('ABCDE');
});

test('Verify SFILE', () => {
  try {
    mockRandom.setRandom(Array.from({ length: 256 }).fill(42) as number[]);
    interface TestRootConfig extends RootConfig {
      a: string;
      b: string;
    }

    const cfg = new Lib.ConfigProcessor<TestRootConfig>({
      a: `SFILE8:${baseDir}/test-file/a.txt`,
      b: `SFILE8:${baseDir}/test-file/b.txt`
    }).process();

    expect(cfg.a).toEqual('ABCDE');
    expect(cfg.b).toEqual('2a2a2a2a2a2a2a2a');
    expect(fs.readFileSync(`${baseDir}/test-file/b.txt`, 'utf8')).toEqual('2a2a2a2a2a2a2a2a');
  } finally {
    mockRandom.reset();
  }
});

test('Verify Config arg patterns', () => {
  expect(new Lib.ConfigProcessor(null).process()).toMatchObject({});
  expect(new Lib.ConfigProcessor(undefined).process()).toMatchObject({});
  expect(new Lib.ConfigProcessor({}).process()).toMatchObject({});

  interface TestRootConfig extends RootConfig {
    a: number | string | null | undefined | { b: number; c: number; d: number };
    b: number;
  }

  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: 1 }, { b: 2 }).process()).toMatchObject({ a: 1, b: 2 });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: 1 }, { a: 2 }).process()).toMatchObject({ a: 2 });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: 1 }, null, undefined).process()).toMatchObject({ a: 1 });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: 1 }, null, undefined, { a: 2 }).process()).toMatchObject({ a: 2 });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: 1 }, null, undefined, { a: '' }).process()).toMatchObject({ a: '' });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: 1 }, null, undefined, { a: null }).process()).toMatchObject({ a: null });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: 1 }, null, undefined, { a: undefined }).process()).toMatchObject({ a: 1 });

  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: { b: 1, c: 2 } }).process()).toMatchObject({ a: { b: 1, c: 2 } });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: { b: 1, c: 2 } }, { a: { c: 3, d: 4 } }).process()).toMatchObject({ a: { b: 1, c: 3, d: 4 } });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: { b: 1, c: 2 } }, { a: 9 }).process()).toMatchObject({ a: 9 });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: { b: 1, c: 2 } }, { a: null }).process()).toMatchObject({ a: null });
  expect(new Lib.ConfigProcessor<TestRootConfig>({ a: { b: 1, c: 2 } }, { a: undefined }).process()).toMatchObject({ a: { b: 1, c: 2 } });
});

test('Coherce bool', () => {
  process.env.unittest_env_1 = 'yes';

  interface TestRootConfig extends RootConfig {
    a: boolean;
    b: boolean;
    c: boolean;
    d: boolean | undefined;
    e: boolean;
    f: boolean;
    g: boolean;
  }

  const t = new Lib.ConfigProcessor<TestRootConfig>({
    a: 'BOOL:true',
    b: 'BOOL:1',
    c: 'BOOL:yes',
    d: 'BOOL:',
    e: 'BOOL:false',
    f: 'BOOL:0',
    g: 'BOOL:ENV:unittest_env_1'
  });
  const cfg = t.process();

  expect(cfg).not.toBeNull();
  expect(cfg.a).toEqual(true);
  expect(cfg.b).toEqual(true);
  expect(cfg.c).toEqual(true);
  expect(cfg.d).toEqual(undefined);
  expect(cfg.e).toEqual(false);
  expect(cfg.f).toEqual(false);
  expect(cfg.g).toEqual(true);

  expect(t.coherceBool('')).toEqual(undefined);
  expect(t.coherceBool(undefined)).toEqual(undefined);
  expect(t.coherceBool(null)).toEqual(null);
  expect(t.coherceBool(1)).toEqual(true);
  expect(t.coherceBool(0)).toEqual(false);
  expect(t.coherceBool(2)).toEqual(true);
  expect(t.coherceBool(true)).toEqual(true);
  expect(t.coherceBool(false)).toEqual(false);
  expect(t.coherceBool('true')).toEqual(true);
  expect(t.coherceBool('false')).toEqual(false);
  expect(t.coherceBool('yes')).toEqual(true);
  expect(t.coherceBool('no')).toEqual(false);
  expect(t.coherceBool('garbage')).toEqual(true);
});

test('Coherce int', () => {
  process.env.unittest_env_1 = '42';

  interface TestRootConfig extends RootConfig {
    a: number;
    b: number | undefined;
    c: number;
    d: number;
  }

  const t = new Lib.ConfigProcessor<TestRootConfig>({
    a: 'INT:10',
    b: 'INT:',
    c: 'INT:0',
    d: 'INT:ENV:unittest_env_1'
  });
  const cfg = t.process();

  expect(cfg).not.toBeNull();
  expect(cfg.a).toEqual(10);
  expect(cfg.b).toEqual(undefined);
  expect(cfg.c).toEqual(0);
  expect(cfg.d).toEqual(42);

  expect(t.coherceInt('', 10)).toEqual(undefined);
  expect(t.coherceInt(undefined, 10)).toEqual(undefined);
  expect(t.coherceInt(null, 10)).toEqual(null);
  expect(t.coherceInt(42, 10)).toEqual(42);
  expect(t.coherceInt('42', 10)).toEqual(42);
  expect(t.coherceInt('042', 10)).toEqual(42);
  expect(t.coherceInt('foo', 10)).toEqual(Number.NaN);
  expect(t.coherceInt('42foo', 10)).toEqual(42);
});

test('Coherce int16', () => {
  process.env.unittest_env_1 = '1f';

  interface TestRootConfig extends RootConfig {
    a: number;
    b: number | undefined;
    c: number;
    d: number;
  }

  const t = new Lib.ConfigProcessor<TestRootConfig>({
    a: 'INT16:0000f',
    b: 'INT16:',
    c: 'INT16:1A',
    d: 'INT16:ENV:unittest_env_1'
  });
  const cfg = t.process();

  expect(cfg).not.toBeNull();
  expect(cfg.a).toEqual(15);
  expect(cfg.b).toEqual(undefined);
  expect(cfg.c).toEqual(0x1A);
  expect(cfg.d).toEqual(0x1F);
});

test('Coherce int8', () => {
  process.env.unittest_env_1 = '12';
  interface TestRootConfig extends RootConfig {
    a: number;
    b: number | undefined;
    c: number;
    d: number;
  }

  const t = new Lib.ConfigProcessor<TestRootConfig>({
    a: 'INT8:07',
    b: 'INT8:',
    c: 'INT8:11',
    d: 'INT8:ENV:unittest_env_1'
  });
  const cfg = t.process();

  expect(cfg).not.toBeNull();
  expect(cfg.a).toEqual(7);
  expect(cfg.b).toEqual(undefined);
  expect(cfg.c).toEqual(9);
  expect(cfg.d).toEqual(10);
});

test('Env Default', () => {
  process.env.unittest_env_1 = '12';
  process.env.unittest_env_2 = '0';
  process.env.unittest_env_3 = '';
  interface TestRootConfig extends RootConfig {
    a: string | undefined;
    b: string | undefined;
    c: string | undefined;
    d: string | undefined;
    e: string | undefined;
  }

  const t = new Lib.ConfigProcessor<TestRootConfig>({
    a: 'ENV:__not__defined__:default',
    b: 'ENV:__not__defined__:',
    c: 'ENV:unittest_env_1:default',
    d: 'ENV:unittest_env_2:default',
    e: 'ENV:unittest_env_3:default'
  });
  const cfg = t.process();

  expect(cfg).not.toBeNull();
  expect(cfg.a).toEqual('default');
  expect(cfg.b).toEqual('');
  expect(cfg.c).toEqual('12');
  expect(cfg.d).toEqual('0');
  expect(cfg.e).toEqual('default');
});

test('Defered Config', () => {
  interface TestRootConfig extends RootConfig {
    foo: string;
    bar: string;
    a: {
      b: string;
      c: string;
    };
    d: number[];
    e: number;
  }

  const t = new Lib.ConfigProcessor<TestRootConfig>({
    foo: 'TEST',
    bar: 'CONFIG:foo',
    a: {
      b: 'TEST2',
      c: 'CONFIG:a.b'
    },
    d: [1, 2, 3],
    e: 'CONFIG:d.1'
  });
  const cfg = t.process();

  expect(cfg).not.toBeNull();
  expect(cfg.foo).toEqual('TEST');
  expect(cfg.bar).toEqual('TEST');
  expect(cfg.a.b).toEqual('TEST2');
  expect(cfg.a.c).toEqual('TEST2');
  expect(cfg.d).toEqual([1, 2, 3]);
  expect(cfg.e).toEqual(2);
});

test('Recursed Defered Config', () => {
  process.env.unittest_env_1 = 'CONFIG:foo';
  interface TestRootConfig extends RootConfig {
    foo: string;
    bar: string;
  }

  const t = new Lib.ConfigProcessor<TestRootConfig>({
    foo: 'TEST',
    bar: 'ENV:unittest_env_1'
  });

  expect(() => t.process()).toThrowError('Cannot use CONFIG in recursed operator: ["bar"]');
});

const defaultExport = {};
export default defaultExport;
