
import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf8');

function checkBalance(str, open, close) {
    let stack = [];
    for (let i = 0; i < str.length; i++) {
        if (str[i] === open) {
            stack.push(i);
        } else if (str[i] === close) {
            if (stack.length === 0) {
                console.error(`Unmatched closing ${close} at ${i}`);
            } else {
                stack.pop();
            }
        }
    }
    if (stack.length > 0) {
        console.error(`Unmatched opening ${open} at positions: ${stack.join(', ')}`);
        stack.forEach(pos => {
            console.log("Context:", str.substring(pos, pos + 100));
        });
    } else {
        console.log(`All ${open}${close} are balanced.`);
    }
}

console.log("Checking curlies...");
checkBalance(content, '{', '}');
console.log("\nChecking parens...");
checkBalance(content, '(', ')');
