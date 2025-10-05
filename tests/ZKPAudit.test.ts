import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

interface Audit {
  proofHash: Uint8Array;
  criteriaId: number;
  timestamp: number;
  submitter: string;
  status: string;
  result: boolean;
}

interface Criteria {
  name: string;
  threshold: number;
  description: string;
  createdBy: string;
  createdAt: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ZKPAuditMock {
  state: {
    contractOwner: string;
    authorityContract: string | null;
    audits: Map<string, Audit>;
    auditCriteria: Map<number, Criteria>;
    auditCounter: Map<string, number>;
  } = {
    contractOwner: "ST1TEST",
    authorityContract: null,
    audits: new Map(),
    auditCriteria: new Map(),
    auditCounter: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";

  reset() {
    this.state = {
      contractOwner: "ST1TEST",
      authorityContract: null,
      audits: new Map(),
      auditCriteria: new Map(),
      auditCounter: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: false };
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    if (this.state.authorityContract !== null) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  addCriteria(name: string, threshold: number, description: string): Result<number> {
    if (!this.state.authorityContract) return { ok: false, value: 100 };
    if (!name || threshold <= 0) return { ok: false, value: 103 };
    const criteriaId = this.state.auditCriteria.size;
    this.state.auditCriteria.set(criteriaId, {
      name,
      threshold,
      description,
      createdBy: this.caller,
      createdAt: this.blockHeight,
    });
    return { ok: true, value: criteriaId };
  }

  submitAudit(farmId: string, proofHash: Uint8Array, criteriaId: number): Result<number> {
    if (!farmId || farmId.length > 50) return { ok: false, value: 101 };
    if (proofHash.length === 0) return { ok: false, value: 102 };
    if (!this.state.auditCriteria.has(criteriaId)) return { ok: false, value: 106 };
    if (!this.state.authorityContract) return { ok: false, value: 100 };
    const auditCount = this.state.auditCounter.get(farmId) || 0;
    const auditKey = `${farmId}-${auditCount}`;
    if (this.state.audits.has(auditKey)) return { ok: false, value: 104 };
    this.state.audits.set(auditKey, {
      proofHash,
      criteriaId,
      timestamp: this.blockHeight,
      submitter: this.caller,
      status: "pending",
      result: false,
    });
    this.state.auditCounter.set(farmId, auditCount + 1);
    return { ok: true, value: auditCount };
  }

  verifyAudit(farmId: string, auditId: number, result: boolean): Result<boolean> {
    if (!farmId || farmId.length > 50) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (this.caller !== this.state.authorityContract) return { ok: false, value: false };
    const auditKey = `${farmId}-${auditId}`;
    const audit = this.state.audits.get(auditKey);
    if (!audit) return { ok: false, value: false };
    this.state.audits.set(auditKey, {
      ...audit,
      status: result ? "verified" : "rejected",
      result,
    });
    return { ok: true, value: true };
  }

  getAudit(farmId: string, auditId: number): Audit | null {
    return this.state.audits.get(`${farmId}-${auditId}`) || null;
  }

  getCriteria(criteriaId: number): Criteria | null {
    return this.state.auditCriteria.get(criteriaId) || null;
  }

  getAuditCount(farmId: string): Result<number> {
    return { ok: true, value: this.state.auditCounter.get(farmId) || 0 };
  }
}

describe("ZKPAudit", () => {
  let contract: ZKPAuditMock;

  beforeEach(() => {
    contract = new ZKPAuditMock();
    contract.reset();
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("adds criteria successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addCriteria("Organic", 100, "No synthetic pesticides");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const criteria = contract.getCriteria(0);
    expect(criteria?.name).toBe("Organic");
    expect(criteria?.threshold).toBe(100);
    expect(criteria?.description).toBe("No synthetic pesticides");
  });

  it("rejects criteria without authority", () => {
    const result = contract.addCriteria("Organic", 100, "No synthetic pesticides");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(100);
  });

  it("submits audit successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addCriteria("Organic", 100, "No synthetic pesticides");
    const proofHash = new Uint8Array(32).fill(1);
    const result = contract.submitAudit("FARM001", proofHash, 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const audit = contract.getAudit("FARM001", 0);
    expect(audit?.proofHash).toEqual(proofHash);
    expect(audit?.criteriaId).toBe(0);
    expect(audit?.status).toBe("pending");
    expect(audit?.result).toBe(false);
  });

  it("rejects audit with invalid farm ID", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addCriteria("Organic", 100, "No synthetic pesticides");
    const proofHash = new Uint8Array(32).fill(1);
    const result = contract.submitAudit("", proofHash, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(101);
  });

  it("verifies audit successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addCriteria("Organic", 100, "No synthetic pesticides");
    const proofHash = new Uint8Array(32).fill(1);
    contract.submitAudit("FARM001", proofHash, 0);
    contract.caller = "ST2TEST";
    const result = contract.verifyAudit("FARM001", 0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const audit = contract.getAudit("FARM001", 0);
    expect(audit?.status).toBe("verified");
    expect(audit?.result).toBe(true);
  });

  it("rejects verify by non-authority", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addCriteria("Organic", 100, "No synthetic pesticides");
    const proofHash = new Uint8Array(32).fill(1);
    contract.submitAudit("FARM001", proofHash, 0);
    contract.caller = "ST3FAKE";
    const result = contract.verifyAudit("FARM001", 0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});