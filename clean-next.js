#!/usr/bin/env node

/**
 * 清理 .next 目录的脚本
 * 解决 Windows 上文件锁定的问题
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const nextDir = path.join(__dirname, '.next');

console.log('🧹 开始清理 .next 目录...\n');

// 步骤1: 尝试杀死所有 Node.js 进程
console.log('1️⃣ 关闭 Node.js 进程...');
try {
  if (process.platform === 'win32') {
    execSync('taskkill /F /IM node.exe /T', { stdio: 'ignore' });
  } else {
    execSync('pkill -9 node', { stdio: 'ignore' });
  }
  console.log('   ✓ Node.js 进程已关闭');
} catch (error) {
  console.log('   ⚠ 没有找到运行中的 Node.js 进程');
}

// 等待一下
console.log('\n2️⃣ 等待文件锁释放...');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
sleep(2000).then(() => {
  console.log('   ✓ 等待完成');

  // 步骤2: 删除 .next 目录
  console.log('\n3️⃣ 删除 .next 目录...');

  const deleteDir = (dir) => {
    if (!fs.existsSync(dir)) {
      console.log('   ℹ .next 目录不存在，无需清理');
      return;
    }

    try {
      // 递归删除，忽略错误
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
      console.log('   ✓ .next 目录已删除');
      return true;
    } catch (error) {
      console.log('   ⚠ 使用 fs.rmSync 失败，尝试其他方法...');

      // 尝试使用系统命令
      try {
        if (process.platform === 'win32') {
          execSync(`rd /s /q "${dir}"`, { stdio: 'ignore' });
        } else {
          execSync(`rm -rf "${dir}"`, { stdio: 'ignore' });
        }
        console.log('   ✓ .next 目录已删除（使用系统命令）');
        return true;
      } catch (cmdError) {
        console.error('   ✗ 删除失败:', error.message);
        console.log('\n❌ 无法删除 .next 目录');
        console.log('💡 请手动执行以下操作：');
        console.log('   1. 关闭所有命令行窗口');
        console.log('   2. 关闭 VSCode 或其他编辑器');
        console.log('   3. 手动删除 .next 文件夹');
        console.log('   4. 重新运行 npm run dev');
        process.exit(1);
      }
    }
  };

  if (deleteDir(nextDir)) {
    console.log('\n✅ 清理完成！现在可以运行 npm run dev');
    console.log('\n💡 提示：如果还是遇到问题，请：');
    console.log('   1. 重启电脑（终极解决方案）');
    console.log('   2. 或者使用 npm run clean:dev 命令');
  }
});
