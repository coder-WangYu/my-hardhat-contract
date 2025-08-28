const hre = require("hardhat");
const { parseEther, formatEther } = require("viem");

(async ()=>{
  console.log("开始部署合约...");

  // 获取部署者账户
  const [deployer] = await hre.viem.getWalletClients();
  console.log("部署者地址:", deployer.account.address);

  // 部署MockERC20作为奖励代币
  console.log("\n部署MockERC20奖励代币...");
  const MockERC20 = await hre.viem.deployContract("MockERC20", ["WY Token", "WY"]);
  console.log("MockERC20部署地址:", MockERC20.address);
  
  // 铸造奖励代币给部署者账户
  await MockERC20.write.mint([deployer.account.address, parseEther("10000")]);
  const rewardAmount = await MockERC20.read.balanceOf([deployer.account.address]);
  console.log("部署者账户余额:", formatEther(rewardAmount));

  // 部署WYStake合约
  console.log("\n部署WYStake质押合约...");
  
  // 设置参数
  const minStakeAmount = parseEther("0.0001"); // 最小质押0.1 ETH
  const duration = 7n * 24n * 60n * 60n; // 7天（秒）
  
  const WYStake = await hre.viem.deployContract("contracts/WYStakeNew.sol:WYStake", [
    MockERC20.address, 
    minStakeAmount, 
    duration
  ]);
  console.log("WYStake部署地址:", WYStake.address);

  // 设置奖励
  await MockERC20.write.transfer([WYStake.address, rewardAmount]);
  console.log("\n设置质押奖励...");
  await WYStake.write.notifyRewardAmount([rewardAmount]);
  console.log(`奖励设置完成，共：${formatEther(rewardAmount)}个奖励代币`);

  // 输出部署信息
  console.log("\n=== 部署完成 ===");
  console.log("✅MockERC20地址:", MockERC20.address);
  console.log("✅WYStake地址:", WYStake.address);
  console.log("✅最小质押金额:", formatEther(minStakeAmount), "ETH");
  console.log("✅质押持续时间:", Number(duration) / (24 * 60 * 60), "天");
  console.log("✅总奖励金额:", formatEther(rewardAmount), "WY");

})().then(() => process.exit(0)).catch((error) => {
  console.error("\n部署失败:", error);
  process.exit(1);
});