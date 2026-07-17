const fs = require('fs');
let code = fs.readFileSync('c:/Users/capy1/Desktop/New folder/main_tail.js', 'utf8');

// Insert newline before common keywords and comment markers
code = code.replace(/(\/\/|\/\*|\*\/|function |const |let |var |if \(|for \(|try \{|\} catch|return |await |document\.)/g, '\n$1');
// Also insert newline after { and } and ;
code = code.replace(/([\{\}\;])/g, '$1\n');

fs.writeFileSync('c:/Users/capy1/Desktop/New folder/main_tail_split.js', code);