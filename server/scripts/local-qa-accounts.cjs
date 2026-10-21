// Explicit local fixture utility; never imported by the application.
// Uses normal provisioning, token consumption and password validation/hashing.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const credentials = path.join(root, 'docs-local/qa-accounts.local.md');
const journal = path.join(root, '.qa-checkpoint/accounts-private.json');

function validateEnvironment(env, args) {
  const url = new URL(env.DATABASE_URL || 'invalid:');
  if (env.NODE_ENV !== 'development' ||
      args.length !== 1 || args[0] !== '--confirm-local=enterprise_service_desk' ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      (url.port || '5432') !== '5432' || url.pathname !== '/enterprise_service_desk' ||
      !['', '?schema=public'].includes(url.search) || url.hash) {
    throw new Error('Requires explicit development mode and confirmed local development database.');
  }
}

async function main() {
  const file = parseEnv(fs.readFileSync(path.join(root, 'server/.env'), 'utf8'));
  const env = { ...file, ...process.env };
  validateEnvironment(env, process.argv.slice(2));
  for (const target of ['docs-local/qa-accounts.local.md', '.qa-checkpoint/accounts-private.json']) {
    execFileSync('git', ['check-ignore', '--quiet', target], { cwd: root });
    if (execFileSync('git', ['ls-files', '--', target], { cwd: root }).length)
      throw new Error('Credential destination is tracked; refusing.');
  }
  Object.assign(process.env, env);
  const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
  const { UsersService } = require('../dist/src/users/users.service.js');
  const { AccountSecurityService } = require('../dist/src/auth/account-security.service.js');
  const { AuthService } = require('../dist/src/auth/auth.service.js');
  const { JwtService } = require('@nestjs/jwt');
  const { validPassword } = require('../dist/src/auth/password.js');
  const bcrypt = require('bcryptjs');
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const [identity] = await prisma.$queryRawUnsafe('SELECT current_database() AS name');
    if (identity.name !== 'enterprise_service_desk') throw new Error('Connected database mismatch');
    const roots = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    const administrator = await prisma.user.findFirst({ where: {
      role: 'SUPER_ADMIN', status: 'ACTIVE', activatedAt: { not: null }, password: { not: null },
    } });
    if (!administrator) throw new Error('An existing activated Super Admin is required; none will be created.');
    const roles = ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE'];
    const planned = roles.flatMap(role => Array.from({length:5}, (_,i) => ({
      role, displayName: `QA ${role[0] + role.slice(1).toLowerCase()} ${String(i+1).padStart(2,'0')}`,
      jobTitle: `Local QA ${role.toLowerCase()}`, email: `qa.${role.toLowerCase()}.${String(i+1).padStart(2,'0')}@example.test`,
    })));
    let accounts;
    if (fs.existsSync(journal)) {
      accounts = JSON.parse(fs.readFileSync(journal, 'utf8'));
      if (accounts.length !== 20 || accounts.some((a,i) => a.email !== planned[i].email || a.role !== planned[i].role || !validPassword(a.password)))
        throw new Error('Unexpected fixture journal; refusing to overwrite.');
    } else {
      if (await prisma.user.count({where:{email:{in:planned.map(a=>a.email)}}}))
        throw new Error('QA identities already exist without their local credential journal.');
      accounts = planned.map(a=>({...a,password:`Qa!${randomBytes(18).toString('base64url')}9`}));
      fs.mkdirSync(path.dirname(journal),{recursive:true});
      fs.writeFileSync(journal,JSON.stringify(accounts,null,2),{flag:'wx',mode:0o600});
    }
    const links = new Map();
    const capturedMail = {
      async sendAccountActivation(email,link) { links.set(email,link); },
      async sendPasswordReset() { throw new Error('Recovery not used by fixture creation'); },
      async sendPasswordChanged() {},
    };
    const security = new AccountSecurityService(prisma,capturedMail);
    const auth = new AuthService(new UsersService(prisma),new JwtService(),security);
    for (const account of accounts) {
      let user = await prisma.user.findUnique({where:{email:account.email}});
      if (!user) {
        const {password,...dto} = account;
        // The existing local administrator's actual role is passed through the
        // unchanged provisioning authority matrix. No fabricated session/JWT.
        await auth.createAccount(administrator.role,dto);
        user = await prisma.user.findUnique({where:{email:account.email}});
      }
      if (user && !user.activatedAt && !user.password) {
        if (!links.has(account.email)) await security.issue(user.id,'ACCOUNT_ACTIVATION');
        const link = links.get(account.email);
        if (!link) throw new Error('Activation delivery was not captured');
        const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
        await security.consume(token,account.password,'ACCOUNT_ACTIVATION');
        links.delete(account.email);
        user = await prisma.user.findUnique({where:{email:account.email}});
      }
      if (!user || user.role !== account.role || user.status !== 'ACTIVE' ||
          !user.activatedAt || !user.emailVerifiedAt || !user.password ||
          user.email !== user.email.trim().toLowerCase() || !user.displayName || !user.jobTitle ||
          !/^\$2[aby]\$10\$/.test(user.password) || user.password === account.password ||
          !(await bcrypt.compare(account.password,user.password)) || user.sessionVersion < 1 || user.passwordChangeRequired)
        throw new Error('QA account verification failed; no existing password/state will be overwritten');
    }
    if (await prisma.user.count({where:{role:'SUPER_ADMIN'}}) !== roots) throw new Error('Super Admin count changed');
    const rows = await prisma.user.findMany({where:{email:{in:accounts.map(a=>a.email)}},select:{id:true,email:true,role:true,status:true,displayName:true,jobTitle:true,activatedAt:true,sessionVersion:true}});
    if(rows.length!==20)throw new Error('Expected exactly 20 QA identities');
    const text = '# Enterprise Service Desk Local QA Accounts\n\n' +
      '**LOCAL TEST CREDENTIALS — NEVER COMMIT OR USE IN PRODUCTION**\n\n' +
      'Local database: `enterprise_service_desk`. Login: http://localhost:3000/login.\n\n' +
      'Provisioned through AuthService; activation tokens captured only in memory and consumed through AccountSecurityService. These synthetic mailboxes were not contacted. No Super Admin was created.\n\n' +
      '| Role | Display name | Email/login | Password | Activated | Notes |\n| --- | --- | --- | --- | --- | --- |\n' +
      accounts.map(a=>`| ${a.role} | ${a.displayName} | ${a.email} | ${a.password} | Yes | Local manual QA |`).join('\n')+'\n';
    fs.mkdirSync(path.dirname(credentials),{recursive:true});
    fs.writeFileSync(credentials,text,{mode:0o600});
    fs.writeFileSync(path.join(root,'.qa-checkpoint/accounts-verified.json'),JSON.stringify(rows,null,2));
    console.log('Verified 20 activated local QA accounts: 5 ADMIN, 5 MANAGER, 5 AGENT, 5 EMPLOYEE; no new SUPER_ADMIN.');
    console.log('Credentials: docs-local/qa-accounts.local.md (ignored; passwords omitted from console).');
  } finally { await prisma.$disconnect(); }
}

module.exports = { validateEnvironment };
if (require.main === module) main().catch((error)=>{
  console.error('Local QA provisioning stopped. Check guards, build, ignored journal and account state; no secrets printed.');
  console.error(error.name, error.code || '', String(error.stack).split('\n').slice(1,4).join('\n'));
  process.exitCode=1;
});
