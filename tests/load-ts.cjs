const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

module.exports = function load(file, dependencies = {}) {
  const compiled = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', source)((name) => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'), dependencies);
    return require(name);
  }, compiled, compiled.exports);
  return compiled.exports;
};
