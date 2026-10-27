import { describe, expect, it } from "vitest";
import { isOrganizationAdmin, isOrganizationOwner } from "./organization-role";

describe("isOrganizationAdmin", () => {
  it("treats owners and admins of the organization as admins", () => {
    expect(isOrganizationAdmin("owner", "user")).toBe(true);
    expect(isOrganizationAdmin("admin", "user")).toBe(true);
  });

  it("does not treat a site-wide admin as an admin of an organization they only belong to", () => {
    expect(isOrganizationAdmin("member", "admin")).toBe(false);
    expect(isOrganizationAdmin(null, "admin")).toBe(false);
  });

  it("lets the site super admin administer every organization", () => {
    expect(isOrganizationAdmin("member", "super_admin")).toBe(true);
    expect(isOrganizationAdmin(null, "super_admin")).toBe(true);
  });

  it("denies a plain member", () => {
    expect(isOrganizationAdmin("member", "user")).toBe(false);
    expect(isOrganizationAdmin(null, "user")).toBe(false);
    expect(isOrganizationAdmin(undefined, null)).toBe(false);
  });
});

describe("isOrganizationOwner", () => {
  it("treats owners of the organization as owners", () => {
    expect(isOrganizationOwner("owner", "user")).toBe(true);
    expect(isOrganizationOwner("owner", "admin")).toBe(true);
  });

  it("denies admins and members who are not owners", () => {
    expect(isOrganizationOwner("admin", "user")).toBe(false);
    expect(isOrganizationOwner("member", "user")).toBe(false);
    expect(isOrganizationOwner("admin", "admin")).toBe(false);
    expect(isOrganizationOwner("member", "admin")).toBe(false);
  });

  it("lets the site super admin act as owner of every organization", () => {
    expect(isOrganizationOwner("member", "super_admin")).toBe(true);
    expect(isOrganizationOwner("admin", "super_admin")).toBe(true);
    expect(isOrganizationOwner(null, "super_admin")).toBe(true);
  });
});
