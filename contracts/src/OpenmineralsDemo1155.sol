// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// DEMO only. One unit = 1 mg GROSS lot mass. Purity is metadata, NOT a
/// second multiplier. No physical metal, legal ownership or redeemable asset.
contract OpenmineralsDemo1155 is ERC1155Supply, AccessControl, ReentrancyGuard {
    uint256 public constant TEST_CHAIN_ID = 84532;
    bytes32 public constant ISSUER_ROLE = keccak256("DEMO_ISSUER_ROLE");
    bool public constant demoOnly = true;
    bytes32 public backingRoot;
    struct Lot {bytes32 sourceKey; bytes4 metal; uint16 purityBps; uint128 capGrossMg; bytes32 documentsHash; bool registered;}
    mapping(uint256 => Lot) public lots;
    mapping(address => bool) public participants;
    mapping(bytes32 => bool) public processedOperations;
    event LotRegistered(uint256 indexed id, bytes32 sourceKey, bytes4 metal, uint16 purityBps, uint128 capGrossMg, bytes32 documentsHash);
    event ParticipantSet(address indexed participant, bool enabled);
    event DemoOperation(bytes32 indexed operationId, uint8 kind, uint256 indexed id, address from, address to, uint256 units);
    error TestnetOnly(); error InvalidDemoOperation(); error NotParticipant(); error CapExceeded(); error OwnerOnly();
    constructor(address administrator, uint64 deadline, bytes32 backingRoot_) ERC1155("") {
        if (block.chainid != TEST_CHAIN_ID) revert TestnetOnly();
        if (administrator == address(0) || block.timestamp > deadline || backingRoot_ == bytes32(0)) revert InvalidDemoOperation();
        backingRoot = backingRoot_;
        _grantRole(DEFAULT_ADMIN_ROLE, administrator); _grantRole(ISSUER_ROLE, administrator);
        participants[administrator] = true; emit ParticipantSet(administrator, true);
    }
    function _consume(bytes32 operationId, uint64 deadline) private {
        if (block.chainid != TEST_CHAIN_ID) revert TestnetOnly();
        if (operationId == bytes32(0) || processedOperations[operationId] || block.timestamp > deadline) revert InvalidDemoOperation();
        processedOperations[operationId] = true;
    }
    function setParticipant(bytes32 operationId, uint64 deadline, address participant, bool enabled) external onlyRole(ISSUER_ROLE) {
        _consume(operationId, deadline); if (participant == address(0)) revert InvalidDemoOperation();
        participants[participant] = enabled; emit ParticipantSet(participant, enabled);
        emit DemoOperation(operationId, 0, 0, msg.sender, participant, 0);
    }
    function registerLot(bytes32 operationId, uint64 deadline, bytes32 sourceKey, bytes4 metal, uint16 purityBps, uint128 capGrossMg, bytes32 documentsHash, bytes32[] calldata proof) external onlyRole(ISSUER_ROLE) {
        _consume(operationId, deadline); uint256 id = uint256(sourceKey);
        if (sourceKey == bytes32(0) || lots[id].registered || purityBps == 0 || purityBps > 10000 || capGrossMg == 0 || capGrossMg > 1_000_000_000 ||
            (metal != bytes4("XAU") && metal != bytes4("XAG") && metal != bytes4("XPT") && metal != bytes4("XPD"))) revert InvalidDemoOperation();
        if (!MerkleProof.verify(proof, backingRoot, keccak256(bytes.concat(keccak256(abi.encode(sourceKey, metal, purityBps, capGrossMg, documentsHash)))))) revert InvalidDemoOperation();
        lots[id] = Lot(sourceKey, metal, purityBps, capGrossMg, documentsHash, true);
        emit LotRegistered(id, sourceKey, metal, purityBps, capGrossMg, documentsHash);
        emit DemoOperation(operationId, 1, id, msg.sender, address(0), 0);
    }
    function issue(bytes32 operationId, uint64 deadline, uint256 id, address to, uint256 units) external onlyRole(ISSUER_ROLE) nonReentrant {
        _consume(operationId, deadline); if (units == 0) revert InvalidDemoOperation();
        _mint(to, id, units, ""); emit DemoOperation(operationId, 2, id, address(0), to, units);
    }
    function transferDemo(bytes32 operationId, uint64 deadline, uint256 id, address to, uint256 units) external nonReentrant {
        _consume(operationId, deadline); if (units == 0) revert InvalidDemoOperation();
        _safeTransferFrom(msg.sender, to, id, units, ""); emit DemoOperation(operationId, 3, id, msg.sender, to, units);
    }
    function cancelDemo(bytes32 operationId, uint64 deadline, uint256 id, uint256 units) external nonReentrant {
        _consume(operationId, deadline); if (units == 0) revert InvalidDemoOperation();
        _burn(msg.sender, id, units); emit DemoOperation(operationId, 4, id, msg.sender, address(0), units);
    }
    // Standard wallet transfers remain indexable through ERC-1155 events;
    // arbitrary approvals/operators cannot take another participant's units.
    function setApprovalForAll(address, bool) public pure override {revert OwnerOnly();}
    function safeTransferFrom(address from, address to, uint256 id, uint256 units, bytes memory data) public override nonReentrant {
        if (msg.sender != from) revert OwnerOnly(); _safeTransferFrom(from, to, id, units, data);
    }
    function safeBatchTransferFrom(address from, address to, uint256[] memory ids, uint256[] memory units, bytes memory data) public override nonReentrant {
        if (msg.sender != from) revert OwnerOnly(); _safeBatchTransferFrom(from, to, ids, units, data);
    }
    function _update(address from, address to, uint256[] memory ids, uint256[] memory units) internal override {
        if (block.chainid != TEST_CHAIN_ID) revert TestnetOnly();
        if ((from != address(0) && to != address(0) && !participants[from]) || (to != address(0) && !participants[to])) revert NotParticipant();
        super._update(from, to, ids, units);
        for (uint256 i; i < ids.length; i++) if (!lots[ids[i]].registered || totalSupply(ids[i]) > lots[ids[i]].capGrossMg) revert CapExceeded();
    }
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {return super.supportsInterface(interfaceId);}
    function uri(uint256 id) public view override returns (string memory) {
        if (!lots[id].registered) revert InvalidDemoOperation();
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(
            '{"name":"Openminerals DEMO units","description":"TESTNET DEMO. No physical metal or legal ownership. 1 unit = 1 mg GROSS lot mass.","massBasis":"gross-lot-mass","unit":"mg","purityBps":',
            Strings.toString(lots[id].purityBps), ',"sourceKey":"', Strings.toHexString(id, 32), '","demoOnly":true}'))));
    }
}
