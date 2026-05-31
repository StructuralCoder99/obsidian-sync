const fs = require('fs');
const code = fs.readFileSync('main.js', 'utf8');
const matches = code.match(/require\('[^']+'\)|require\("[^"]+"\)/g);
console.log(matches ? [...new Set(matches)] : []);
