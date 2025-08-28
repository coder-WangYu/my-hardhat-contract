import { expect } from "chai";
import { parseEther, formatEther } from "viem";
import hre from "hardhat";

describe("WYStake 合约", function () {
  // 定义测试变量
  let mockERC20: any;
  let wyStake: any;
  let deployer: any;
  let user1: any;
  let user2: any;
  const minStakeAmount = parseEther("0.1"); // 最小质押0.1 ETH
  const duration = 7n * 24n * 60n * 60n; // 7天（秒）
  const initialReward = parseEther("1000"); // 1000个奖励代币

  // 在每个测试前部署合约
  beforeEach(async function () {
    // 获取测试账户
    [deployer, user1, user2] = await hre.viem.getWalletClients();
    
    // 部署MockERC20代币合约
    mockERC20 = await hre.viem.deployContract("MockERC20", ["WY Token", "WY"]);
    
    // 铸造代币给部署者
    await mockERC20.write.mint([deployer.account.address, initialReward]);
    
    // 部署WYStake合约
    wyStake = await hre.viem.deployContract("contracts/WYStakeNew.sol:WYStake", [
      mockERC20.address,
      minStakeAmount,
      duration
    ]);
    
    // 转移一些代币到质押合约并设置奖励
    await mockERC20.write.transfer([wyStake.address, initialReward]);
    await wyStake.write.notifyRewardAmount([initialReward]);
  });

  // 测试合约部署是否成功
  describe("部署", function () {
    it("应该正确设置合约参数", async function () {
      // 检查奖励代币地址
      const rewardTokenAddress = await wyStake.read.rewardToken();
      expect(rewardTokenAddress.toLowerCase()).to.equal(mockERC20.address.toLowerCase());
      
      // 检查最小质押金额
      const contractMinStake = await wyStake.read.minStakeAmount();
      expect(contractMinStake).to.equal(minStakeAmount);
      
      // 检查质押持续时间
      const contractDuration = await wyStake.read.duration();
      expect(contractDuration).to.equal(duration);
      
      // 检查合约所有者
      const owner = await wyStake.read.owner();
      expect(owner.toLowerCase()).to.equal(deployer.account.address.toLowerCase());
    });

    it("应该正确设置奖励", async function () {
      const contractRewardRate = await wyStake.read.rewardRate();
      const expectedRate = initialReward / duration;
      
      // 由于区块链中的除法可能有精度损失，我们检查是否接近而不是完全相等
      expect(Number(contractRewardRate)).to.be.closeTo(Number(expectedRate), 1);
      
      // 检查奖励代币余额
      const balance = await mockERC20.read.balanceOf([wyStake.address]);
      expect(balance).to.equal(initialReward);
    });
  });

  // 测试质押功能
  describe("质押", function () {
    it("应该允许用户质押ETH", async function () {
      const stakeAmount = parseEther("0.5"); // 质押0.5 ETH
      
      // 用户1质押ETH
      await user1.writeContract({
        address: wyStake.address,
        abi: wyStake.abi,
        functionName: "stake",
        value: stakeAmount
      });
      
      // 检查用户1的质押余额
      const userBalance = await wyStake.read.balanceOf([user1.account.address]);
      expect(userBalance).to.equal(stakeAmount);
      
      // 检查总质押量
      const totalSupply = await wyStake.read.totalSupply();
      expect(totalSupply).to.equal(stakeAmount);
    });

    it("应该拒绝低于最小质押金额的质押", async function () {
      const smallStakeAmount = parseEther("0.05"); // 低于最小质押金额
      
      // 尝试质押过少的ETH，应该失败
      await expect(
        user1.writeContract({
          address: wyStake.address,
          abi: wyStake.abi,
          functionName: "stake",
          value: smallStakeAmount
        })
      ).to.be.rejectedWith("Amount is less than min stake amount");
    });
  });

  // 测试提取功能
  describe("提取", function () {
    beforeEach(async function () {
      // 先让用户1质押一些ETH
      const stakeAmount = parseEther("0.5");
      await user1.writeContract({
        address: wyStake.address,
        abi: wyStake.abi,
        functionName: "stake",
        value: stakeAmount
      });
    });

    it("应该允许用户提取质押的ETH", async function () {
      const withdrawAmount = parseEther("0.2"); // 提取0.2 ETH
      
      // 用户1提取ETH
      await user1.writeContract({
        address: wyStake.address,
        abi: wyStake.abi,
        functionName: "withdraw",
        args: [withdrawAmount]
      });
      
      // 检查用户1的质押余额是否减少
      const userStakeBalance = await wyStake.read.balanceOf([user1.account.address]);
      expect(userStakeBalance).to.equal(parseEther("0.3")); // 0.5 - 0.2 = 0.3
      
      // 检查总质押量是否减少
      const totalSupply = await wyStake.read.totalSupply();
      expect(totalSupply).to.equal(parseEther("0.3"));
    });

    it("应该拒绝提取超过质押金额的ETH", async function () {
      const excessWithdrawAmount = parseEther("0.6"); // 超过质押金额
      
      // 尝试提取过多的ETH，应该失败
      await expect(
        user1.writeContract({
          address: wyStake.address,
          abi: wyStake.abi,
          functionName: "withdraw",
          args: [excessWithdrawAmount]
        })
      ).to.be.rejectedWith("Insufficient balance");
    });
  });

  // 测试奖励计算和领取功能
  describe("奖励", function () {
    beforeEach(async function () {
      // 用户1质押ETH
      await user1.writeContract({
        address: wyStake.address,
        abi: wyStake.abi,
        functionName: "stake",
        value: parseEther("0.5")
      });
    });

    it("应该正确计算用户的奖励", async function () {
      // 模拟时间经过（1天）
      await hre.network.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");
      
      // 计算用户1应得的奖励
      const earnedReward = await wyStake.read.earned([user1.account.address]);
      
      // 由于奖励计算涉及时间，这里只检查是否有奖励生成
      expect(earnedReward > 0n).to.be.true;
    });

    it("应该允许用户领取奖励", async function () {
      // 模拟时间经过（1天）
      await hre.network.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");
      
      // 获取用户1应得的奖励
      const earnedReward = await wyStake.read.earned([user1.account.address]);
      
      // 用户1领取奖励
      await user1.writeContract({
        address: wyStake.address,
        abi: wyStake.abi,
        functionName: "claimReward"
      });
      
      // 检查用户1的奖励代币余额
      const userRewardBalance = await mockERC20.read.balanceOf([user1.account.address]);
      // 由于区块链中的奖励计算可能有精度损失，我们检查是否接近而不是完全相等
      expect(Number(userRewardBalance)).to.be.closeTo(Number(earnedReward), Number(parseEther("0.01")));
      
      // 检查用户1在合约中的奖励是否已清零
      const remainingReward = await wyStake.read.rewards([user1.account.address]);
      expect(remainingReward).to.equal(0n);
    });
  });

  // 测试多用户场景
  describe("多用户场景", function () {
    it("应该根据质押比例分配奖励", async function () {
      // 用户1质押0.3 ETH
      await user1.writeContract({
        address: wyStake.address,
        abi: wyStake.abi,
        functionName: "stake",
        value: parseEther("0.3")
      });
      
      // 用户2质押0.6 ETH
      await user2.writeContract({
        address: wyStake.address,
        abi: wyStake.abi,
        functionName: "stake",
        value: parseEther("0.6")
      });
      
      // 模拟时间经过（1天）
      await hre.network.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");
      
      // 获取用户1和用户2的奖励
      const user1Reward = await wyStake.read.earned([user1.account.address]);
      const user2Reward = await wyStake.read.earned([user2.account.address]);
      
      // 用户2的奖励应该是用户1的约2倍（因为质押比例是2:1）
      // 由于区块链计算中可能有精度损失，我们检查比例是否接近2
      const ratio = Number(user2Reward) / Number(user1Reward);
      expect(ratio).to.be.closeTo(2, 0.1);
    });
  });
});
