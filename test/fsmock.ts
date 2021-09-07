//
// Mock node's fs with a union filesystem before we get anywhere
//
import { Union } from "unionfs";
import { DirectoryJSON, Volume } from "memfs";
const nodeFs = jest.requireActual(`fs`);
import { OpenDirOptions, Dir, PathLike } from "fs";

//
// Setup the unionfs
//
const unionfs = new Union();

//
// Install the mock
//
jest.mock(`fs`, () => {

    (unionfs as any).reset = () => { // eslint-disable-line @typescript-eslint/no-explicit-any
        // fss is unionfs' list of overlays
        (unionfs as any).fss = [nodeFs] // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    return unionfs.use(nodeFs)
})

//
// memfs does not implement opendir - here is a hacky minimal implementation
// here is a hacky minimal implementation that we can monkeypatch in
//
const opendirImpl = (fs: any) => async (path: PathLike, options?: OpenDirOptions) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
        [Symbol.asyncIterator]() {
            interface itr {
                index: number,
                files: Dir[],
                next: () => Promise<{ done: boolean, value?: Dir }>
            }
            return {
                index: -1,
                files: [],
                async next() {
                    if (this.index === -1) {
                        this.index = 0;
                        this.files = await fs.promises.readdir(path, { encoding: options?.encoding, withFileTypes: true });
                    }
                    if (this.index < this.files.length) return { done: false, value: this.files[this.index++] };
                    return { done: true };
                }
            } as itr;
        }
    }
}


//
// Export something easy to use
//
export default {
    use(fs: any): void { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-explicit-any
        unionfs.use(fs);
    },

    reset(): void {
        // fss is unionfs' list of overlays
        (unionfs as any).fss = [nodeFs] // eslint-disable-line @typescript-eslint/no-explicit-any
    },

    populate(json: DirectoryJSON, cwd?: string): void {
        const vol = Volume.fromJSON(json, cwd);
        (vol.promises as any).opendir ??= opendirImpl(vol); // eslint-disable-line @typescript-eslint/no-explicit-any
        this.use(vol);
    }
}
