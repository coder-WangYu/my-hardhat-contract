// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";

contract WYStake {
    IERC20 public immutable stakingToken; // 质押代币
    IERC20 public immutable rewardToken; // 奖励代币

    address public owner; // 合约所有者

    uint public minStakeAmount; // 最小质押数量
    uint public duration; // 质押持续时间
    uint public finishAt; // 质押结束时间
    uint public updatedAt; // 最后一次更新时间
    uint public rewardRate; // 奖励率（每秒奖励数量）
    uint public rewardPerTokenStored; // 每单位代币的奖励数量 = 奖励率 * 持续时间 / 总供应量
    mapping(address => uint) public userRewardPerTokenPaid; // 用户已支付的奖励数量
    mapping(address => uint) public rewards; // 用户获得的奖励数量

    uint public totalSupply; // 质押代币总量
    mapping(address => uint) public balanceOf; // 用户质押数量

    // 只有合约所有者可以调用
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    // 更新奖励数量
    modifier updateReward(address _account) {
        rewardPerTokenStored = rewardPerToken();
        updatedAt = lastTimeRewardApplicable();

        // 如果用户存在，则更新奖励数量
        if (_account != address(0)) {
            rewards[_account] = earned(_account);
            userRewardPerTokenPaid[_account] = rewardPerTokenStored;
        }

        _;
    }

    constructor(address _stakingToken, address _rewardToken) {
        owner = msg.sender;
        // stakingToken = IERC20(address(0x0)); // 质押代币为ETH
        stakingToken = IERC20(address(_stakingToken)); // 质押代币为WY
        rewardToken = IERC20(address(_rewardToken)); // 奖励代币为WY
    }

    // 设置最小质押金额
    function setMinStakeAmount(uint _minStakeAmount) external onlyOwner {
        minStakeAmount = _minStakeAmount;
    }

    // 设置质押持续时间/奖励期限
    function setRewardsDuration(uint _duration) external onlyOwner {
        require(block.timestamp > finishAt, "Reward duration not finished");
        duration = _duration;
    }

    // 通知奖励金额，并设置奖励率
    function notifyRewardAmount(
        uint _amount
    ) external onlyOwner updateReward(address(0)) {
        if (block.timestamp > finishAt) {
            // 奖励期限已过/尚未开始
            rewardRate = _amount / duration; // 要支付的奖励金额 / 持续时间
        } else {
            // 奖励期限尚未结束
            uint remainingRewards = rewardRate * (finishAt - block.timestamp); // 计算剩余奖励金额、
            rewardRate = (_amount + remainingRewards) / duration; // 更新奖励率
        }

        require(rewardRate > 0, "Reward rate is 0"); // 奖励率不能为0
        require(
            rewardRate * duration <= rewardToken.balanceOf(address(this)),
            "Reward amount is not enough"
        ); // 奖励金额不能超过奖励代币余额

        finishAt = block.timestamp + duration; // 更新质押结束时间
        updatedAt = block.timestamp; // 更新最后一次更新时间
    }

    // 用户质押代币
    function stake(uint _amount) external updateReward(msg.sender) {
        require(
            _amount >= minStakeAmount,
            "Amount is less than min stake amount"
        );
        stakingToken.transferFrom(msg.sender, address(this), _amount);
        balanceOf[msg.sender] += _amount; // 记录用户质押的金额
        totalSupply += _amount; // 更新质押代币总量
    }

    // 用户领取质押代币
    function withdraw(uint _amount) external updateReward(msg.sender) {
        require(_amount > 0, "Amount must be greater than 0");
        balanceOf[msg.sender] -= _amount; // 减少用户质押的金额
        totalSupply -= _amount; // 更新质押代币总量
        stakingToken.transfer(msg.sender, _amount); // 将代币转回给用户
    }

    // 计算最小值
    function _min(uint x, uint y) private pure returns (uint) {
        return x <= y ? x : y;
    }

    // 计算最后一次奖励时间
    function lastTimeRewardApplicable() public view returns (uint) {
        return _min(block.timestamp, finishAt);
    }

    // 计算每单位代币的奖励数量
    function rewardPerToken() public view returns (uint) {
        if (totalSupply == 0) {
            return rewardPerTokenStored;
        }

        return
            rewardPerTokenStored +
            (rewardRate * (lastTimeRewardApplicable() - updatedAt) * 1e18) /
            totalSupply;
    }

    // 用户查看当前赚取的奖励
    function earned(address _account) public view returns (uint) {
        return
            (balanceOf[_account] *
                (rewardPerToken() - userRewardPerTokenPaid[_account])) /
            1e18 +
            rewards[_account];
    }

    // 用户领取奖励
    function claimReward() external updateReward(msg.sender) {
        uint reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.transfer(msg.sender, reward);
        }
    }
}
