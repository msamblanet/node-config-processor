import fsmock from "./fsmock";
import * as Lib from "../src/index";
import LibDefault from "../src/index";
import Obfuscator from "@msamblanet/node-obfuscator";
import fs from "fs";
import crypto from "crypto";

const obf = new Obfuscator();
const rawString1 = "ObfStr1";
const obfString1 = obf.encodeString(rawString1);

const baseDir = "/__UNIT__TESTS__";
beforeAll(() => {
    fsmock.populate(
        {
            "test-file/a.txt": 'ABCDE',
        },
        baseDir
    );
});

afterAll(() => {
    fsmock.reset();
});

test("Check Exports", () => {
    expect(Lib).not.toBeNull();
    expect(Lib.ConfigProcessor).not.toBeNull();

    expect(LibDefault).toEqual(Lib.ConfigProcessor);
})

test("Check Basics", () => {
    process.env["unittest_env_1"] = "98765";
    process.env["unittest_env_2"] = `OBF:${obfString1}`;

    const t = new Lib.ConfigProcessor({
        a: "ABCDE",
        b: true,
        c: undefined,
        d: null,
        e: [1,"A",undefined,null,true],
        f: "RAW:ABCDE",
        g: "HEX:5758595A", // WXYZ
        h: "B64:TU5PUA==", // MNOP
        i: "ENV:unittest_env_1", // 98765
        j: `OBF:${obfString1}`,
        k: "ABC:DEF:GHI",
        l: "RAW:",
        m: "ENV:unittest_env_doesnotexist",
        n: "ENV:unittest_env_2"
    });
    const cfg = t.process();

    expect(cfg).not.toBeNull();
    expect(cfg.a).toEqual("ABCDE");
    expect(cfg.b).toEqual(true);
    expect(cfg.c).toEqual(undefined);
    expect(cfg.d).toEqual(null);
    expect(cfg.e).toEqual([1,"A",undefined,null,true]);
    expect(cfg.f).toEqual("ABCDE");
    expect(cfg.g).toEqual("WXYZ");
    expect(cfg.h).toEqual("MNOP");
    expect(cfg.i).toEqual("98765");
    expect(cfg.j).toEqual(rawString1);
    expect(cfg.k).toEqual("ABC:DEF:GHI");
    expect(cfg.l).toEqual("");
    expect(cfg.m).toEqual("");
    expect(cfg.n).toEqual(rawString1);
});

test("Check Obfuscate String", () => {
    const t = new Lib.ConfigProcessor();
    const t2 = t.obfuscateString("ABCDE");
    const t3 = t.obfuscateString("FGHIJ", Obfuscator.DEFAULT_CONFIG.defaultAlg);

    const t4 = new Lib.ConfigProcessor( { a: `OBF:${t2}`, b: `OBF:${t3}` });
    const cfg = t4.process();

    expect(cfg).toMatchObject({ a: "ABCDE", b: "FGHIJ" });
});

test("No obfuscation in processor config", () => {
    const cfg: Lib.RootConfigOverrides = {
        configProcessor: {
            obfuscator: {
                defaultAlg: `OBF:${obfString1}`
            }
        }
    };
    expect(() => new Lib.ConfigProcessor(cfg)).toThrowError("Obfuscator not allowed at this time: ");
});

test("Verify FILE", () => {
    const cfg = new Lib.ConfigProcessor({
        a: `FILE:${baseDir}/test-file/a.txt`
    }).process();

    expect(cfg.a).toEqual("ABCDE");
});

test("Verify SFILE", () => {
    const oldRandom = crypto.randomBytes;
    try {
        crypto.randomBytes = (n: number) => {
            return Buffer.from(Array(n).fill(42));
        }
        const cfg = new Lib.ConfigProcessor({
            a: `SFILE8:${baseDir}/test-file/a.txt`,
            b: `SFILE8:${baseDir}/test-file/b.txt`
        }).process();

        expect(cfg.a).toEqual("ABCDE");
        expect(cfg.b).toEqual("2a2a2a2a2a2a2a2a");
        expect(fs.readFileSync(`${baseDir}/test-file/b.txt`, "utf8")).toEqual("2a2a2a2a2a2a2a2a");
    } finally {
        crypto.randomBytes = oldRandom;
    }

});
