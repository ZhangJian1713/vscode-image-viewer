declare module 'picomatch' {
  interface Options {
    dot?: boolean
    nocase?: boolean
    strictBrackets?: boolean
    noextglob?: boolean
    nonegate?: boolean
    regex?: boolean
    maxLength?: number
  }
  function picomatch(pattern: string, options?: Options): (input: string) => boolean
  namespace picomatch {
    function scan(pattern: string, options?: Options): { isGlob: boolean; base: string }
  }
  export = picomatch
}
