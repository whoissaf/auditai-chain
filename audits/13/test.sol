// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AuditAIChain
 * @dev Smart contract untuk simulasi sistem audit AI dengan fitur:
 * - Role-based access (Owner, Auditor, User)
 * - Deposit & withdraw ETH
 * - Submit audit request
 * - Staking sederhana untuk auditor
 * - Event & error custom
 */

contract AuditAIChain {
    // ==================== ERROR ====================
    error Unauthorized();
    error InvalidAddress();
    error InsufficientBalance();
    error InsufficientStake();
    error AuditNotFound();
    error InvalidStatus();
    error AlreadyProcessed();
    error TransferFailed();

    // ==================== EVENT ====================
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    event AuditSubmitted(uint256 indexed auditId, address indexed user, string ipfsHash);
    event AuditProcessed(uint256 indexed auditId, uint256 riskScore, string reportIpfs);
    event StakeAdded(address indexed auditor, uint256 amount);
    event StakeRemoved(address indexed auditor, uint256 amount);
    event RoleChanged(address indexed user, Role newRole);

    // ==================== ENUM & STRUCT ====================
    enum Role { None, User, Auditor, Admin }
    enum AuditStatus { Pending, Processing, Completed, Failed }

    struct Audit {
        uint256 id;
        address user;
        string ipfsHash;
        uint256 riskScore;
        string reportIpfs;
        AuditStatus status;
        uint256 createdAt;
        uint256 processedAt;
    }

    struct AuditorStake {
        uint256 amount;
        uint256 auditsDone;
        uint256 rewardsClaimed;
        bool active;
    }

    // ==================== STATE VARIABLES ====================
    address public owner;
    uint256 public auditCounter;
    uint256 public constant MIN_STAKE = 1 ether;
    uint256 public constant PLATFORM_FEE_PERCENT = 5; // 5%

    mapping(address => Role) public roles;
    mapping(address => AuditorStake) public auditorStakes;
    mapping(uint256 => Audit) public audits;
    mapping(address => uint256) public userBalances;

    // ==================== MODIFIER ====================
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAdminOrAuditor() {
        Role r = roles[msg.sender];
        if (r != Role.Admin && r != Role.Auditor) revert Unauthorized();
        _;
    }

    modifier validAddress(address _addr) {
        if (_addr == address(0)) revert InvalidAddress();
        _;
    }

    // ==================== CONSTRUCTOR ====================
    constructor() {
        owner = msg.sender;
        roles[msg.sender] = Role.Admin;
    }

    // ==================== DEPOSIT & WITHDRAW ====================
    function deposit() external payable {
        if (msg.value == 0) revert InsufficientBalance();
        userBalances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 _amount) external {
        if (userBalances[msg.sender] < _amount) revert InsufficientBalance();
        userBalances[msg.sender] -= _amount;

        (bool success, ) = payable(msg.sender).call{value: _amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawal(msg.sender, _amount);
    }

    // ==================== ROLE MANAGEMENT ====================
    function setRole(address _user, Role _role) external onlyOwner validAddress(_user) {
        roles[_user] = _role;
        emit RoleChanged(_user, _role);
    }

    function getUserRole(address _user) external view returns (Role) {
        return roles[_user];
    }

    // ==================== AUDITOR STAKING ====================
    function addStake() external payable {
        if (msg.value == 0) revert InsufficientBalance();
        AuditorStake storage stake = auditorStakes[msg.sender];
        stake.amount += msg.value;
        stake.active = true;
        emit StakeAdded(msg.sender, msg.value);
    }

    function removeStake(uint256 _amount) external {
        AuditorStake storage stake = auditorStakes[msg.sender];
        if (!stake.active || stake.amount < _amount) revert InsufficientStake();
        if (stake.auditsDone == 0 && _amount > stake.amount) revert InsufficientStake();

        stake.amount -= _amount;
        if (stake.amount == 0) stake.active = false;

        (bool success, ) = payable(msg.sender).call{value: _amount}("");
        if (!success) revert TransferFailed();

        emit StakeRemoved(msg.sender, _amount);
    }

    function getAuditorStake(address _auditor) external view returns (uint256, uint256, uint256, bool) {
        AuditorStake storage stake = auditorStakes[_auditor];
        return (stake.amount, stake.auditsDone, stake.rewardsClaimed, stake.active);
    }

    // ==================== SUBMIT AUDIT ====================
    function submitAudit(string calldata _ipfsHash) external returns (uint256) {
        if (roles[msg.sender] == Role.None) revert Unauthorized();

        auditCounter++;
        uint256 auditId = auditCounter;

        audits[auditId] = Audit({
            id: auditId,
            user: msg.sender,
            ipfsHash: _ipfsHash,
            riskScore: 0,
            reportIpfs: "",
            status: AuditStatus.Pending,
            createdAt: block.timestamp,
            processedAt: 0
        });

        emit AuditSubmitted(auditId, msg.sender, _ipfsHash);
        return auditId;
    }

    // ==================== PROCESS AUDIT (AUDITOR/ADMIN) ====================
    function processAudit(
        uint256 _auditId,
        uint256 _riskScore,
        string calldata _reportIpfs
    ) external onlyAdminOrAuditor {
        Audit storage audit = audits[_auditId];
        if (audit.id == 0) revert AuditNotFound();
        if (audit.status != AuditStatus.Pending && audit.status != AuditStatus.Processing) revert AlreadyProcessed();
        if (_riskScore > 100) revert InvalidStatus();

        audit.status = AuditStatus.Completed;
        audit.riskScore = _riskScore;
        audit.reportIpfs = _reportIpfs;
        audit.processedAt = block.timestamp;

        if (roles[msg.sender] == Role.Auditor) {
            auditorStakes[msg.sender].auditsDone++;
        }

        uint256 fee = (_riskScore * 1 ether) / 100;
        uint256 platformFee = (fee * PLATFORM_FEE_PERCENT) / 100;
        uint256 auditorReward = fee - platformFee;

        userBalances[msg.sender] += auditorReward;

        emit AuditProcessed(_auditId, _riskScore, _reportIpfs);
    }

    // ==================== GET AUDIT ====================
    function getAudit(uint256 _auditId) external view returns (
        uint256 id,
        address user,
        string memory ipfsHash,
        uint256 riskScore,
        string memory reportIpfs,
        AuditStatus status,
        uint256 createdAt,
        uint256 processedAt
    ) {
        Audit storage audit = audits[_auditId];
        if (audit.id == 0) revert AuditNotFound();

        return (
            audit.id,
            audit.user,
            audit.ipfsHash,
            audit.riskScore,
            audit.reportIpfs,
            audit.status,
            audit.createdAt,
            audit.processedAt
        );
    }

    // ==================== GET CONTRACT BALANCE ====================
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ==================== EMERGENCY WITHDRAW (OWNER) ====================
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert InsufficientBalance();

        (bool success, ) = payable(owner).call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    // ==================== FALLBACK & RECEIVE ====================
    fallback() external payable {
        deposit();
    }

    receive() external payable {
        deposit();
    }
}