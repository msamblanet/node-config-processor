//
// Mock node's fs with a union filesystem before we get anywhere
//
import type { OpenDirOptions, Dir, Dirent, PathLike } from 'node:fs';
import type { Jest } from '@jest/environment';
import { IUnionFs, Union } from 'unionfs';
import { DirectoryJSON, Volume } from 'memfs';

type FsType = IUnionFs;
type UnionFsType = IUnionFs & {
  // Expose some internal impelemntation
  fss: FsType[];
  reset(): void;
};

//
// memfs does not implement opendir - here is a hacky minimal implementation
// here is a hacky minimal implementation that we can monkeypatch in
//
class AsyncDirIterator implements Dir {
  public readonly path: string;
  protected readonly fs: FsType;
  protected readonly options?: OpenDirOptions;
  protected index = -1;
  protected files: Dirent[] = [];

  public constructor(fs: FsType, path: string, options?: OpenDirOptions) {
    this.path = path;
    this.fs = fs;
    this.options = options;
  }

  public [Symbol.asyncIterator](): AsyncIterableIterator<Dirent> {
    return new AsyncDirIterator(this.fs, this.path);
  }

  public async next(): Promise<IteratorResult<Dirent>> {
    const rv = await this.read();
    return { done: Boolean(rv), value: rv };
  }

  public async read(): Promise<Dirent> {
    if (this.index === -1) {
      this.index = 0;
      this.files = await this.fs.promises.readdir(this.path, { ...this.options, withFileTypes: true, encoding: 'utf8' });
    }

    return this.files[this.index++] ?? null;
  }

  public readSync(): Dirent {
    if (this.index === -1) {
      this.index = 0;
      this.files = this.fs.readdirSync(this.path, { ...this.options, withFileTypes: true, encoding: 'utf8' });
    }

    return this.files[this.index++] ?? null;
  }

  public async close(): Promise<void> {} // eslint-disable-line @typescript-eslint/no-empty-function
  public closeSync(): void {} // eslint-disable-line @typescript-eslint/no-empty-function
}

//
// Export something easy to use
//
export class MockFs {
  protected readonly unionfs: UnionFsType;
  protected readonly nodeFs: FsType;

  constructor(jestObject: Jest) {
    this.nodeFs = jestObject.requireActual('node:fs') as FsType;

    //
    // Setup the unionfs
    //
    this.unionfs = new Union() as unknown as UnionFsType;
    this.unionfs.reset = () => {
      this.unionfs.fss = [this.nodeFs];
    };

    this.unionfs.use(this.nodeFs);

    const mock = { default: this.unionfs };

    jestObject.unstable_mockModule('node:fs', () => mock);
    jestObject.unstable_mockModule('fs', () => mock);
  }

  use(fs: FsType): void {
    this.unionfs.use(fs);
  }

  reset(): void {
    // fss is unionfs' list of overlays
    this.unionfs.reset();
  }

  populate(json: DirectoryJSON, cwd?: string): void {
    const vol = Volume.fromJSON(json, cwd) as unknown as FsType;
    vol.promises.opendir ??= async (path, options): Promise<Dir> => this.openDir(path, options);
    this.use(vol);
  }

  protected async openDir(path: PathLike, options?: OpenDirOptions): Promise<Dir> {
    return new AsyncDirIterator(this.nodeFs, path.toString(), options);
  }
}

export default MockFs;
