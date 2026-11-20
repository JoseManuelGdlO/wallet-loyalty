import { ForbiddenException } from "@nestjs/common";
import { assertBusinessAccess, type AuthUser } from "./access";

const employee: AuthUser = {
  id: "emp",
  email: "e@cafe.test",
  name: "Luis",
  role: "EMPLOYEE",
  tenantId: "tenant-a",
  businessId: "biz-a",
  branchId: "branch-a",
};

describe("aislamiento por negocio", () => {
  it("deja pasar al empleado de su propio negocio", () => {
    expect(() =>
      assertBusinessAccess(employee, { tenantId: "tenant-a", businessId: "biz-a" }),
    ).not.toThrow();
  });

  it("rechaza a un empleado de otra cuenta", () => {
    expect(() =>
      assertBusinessAccess(employee, { tenantId: "tenant-b", businessId: "biz-b" }),
    ).toThrow(ForbiddenException);
  });

  it("un cliente no administra ningún negocio", () => {
    const customer: AuthUser = { ...employee, role: "CUSTOMER" };
    expect(() =>
      assertBusinessAccess(customer, { tenantId: "tenant-a", businessId: "biz-a" }),
    ).toThrow(ForbiddenException);
  });
});
