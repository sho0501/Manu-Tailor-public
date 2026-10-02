import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=files.filter(name=>/(^|\/)(node_modules|\.venv|uploads|database|logs|cache|models|secrets|dist|build)\//.test(name)||(/(^|\/)\.env($|\.)/.test(name)&&!name.endsWith('.env.example'))||/\.(keystore|jks|p12|p8|mobileprovision|sqlite3?|db)$/.test(name));
const leaked=files.filter(name=>!name.endsWith('.png')&&/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|gsk_[A-Za-z0-9]{30,}|AIza[A-Za-z0-9_-]{30,}/.test(readFileSync(name,'utf8')));
if(forbidden.length||leaked.length){console.error('Repository check failed:',[...forbidden,...leaked]);process.exit(1);}
console.log(`Repository check passed: ${files.length} tracked files; no forbidden data, credentials or build output.`);
