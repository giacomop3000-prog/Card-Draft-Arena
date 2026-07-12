export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export type ObjectAclPolicy = {
  visibility: "public" | "private";
  acl?: Record<string, ObjectPermission[]>;
};

export async function getObjectAclPolicy(_file: unknown): Promise<ObjectAclPolicy | null> {
  return { visibility: "public" };
}

export async function setObjectAclPolicy(_file: unknown, _policy: ObjectAclPolicy): Promise<void> {}

export async function canAccessObject(_opts: unknown): Promise<boolean> {
  return true;
}
