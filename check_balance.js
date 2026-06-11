
import fs from 'fs';

const content = fs.readFileSync('/src/components/GameCanvas.tsx', 'utf8');

function checkBalance(str) {
    let stack = [];
    let lines = str.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        for (let j = 0; j < line.length; j++) {
            let char = line[j];
            if (char === '(' || char === '{' || char === '[') {
                stack.push({ char, line: i + 1, col: j + 1 });
            } else if (char === ')' || char === '}' || char === ']') {
                if (stack.length === 0) {
                    console.log(`Unmatched closing ${char} at line ${i + 1}, col ${j + 1}`);
                    continue;
                }
                let last = stack.pop();
                if ((char === ')' && last.char !== '(') ||
                    (char === '}' && last.char !== '{') ||
                    (char === ']' && last.char !== '[')) {
                    console.log(`Mismatch: ${last.char} at line ${last.line} with ${char} at line ${i + 1}`);
                }
            }
        }
    }
    while (stack.length > 0) {
        let last = stack.pop();
        console.log(`Unclosed ${last.char} at line ${last.line}, col ${last.col}`);
    }
}

checkBalance(content);
