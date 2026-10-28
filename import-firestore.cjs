const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const datasets = [
  { collection: "users", keyFields: ["id", "username"] },
  { collection: "members", keyFields: ["id", "member_no", "staffNumber"] },
  { collection: "savings", keyFields: ["id"] },
  { collection: "loans", keyFields: ["id", "loan_no"] },
  { collection: "repayments", keyFields: ["id"] }
];
const chunkSize = 400;
const credentialField = /password|token|secret|credential/i;

function rejectCredentials(value, location) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (credentialField.test(key)) {
      throw new TypeError(
        `${location} contains credential field "${key}". Store login credentials in Firebase Authentication, not Firestore documents.`
      );
    }
    rejectCredentials(child, `${location}.${key}`);
  }
}

function readDataset({ collection, keyFields }) {
  const filePath = path.join(__dirname, "..", "firestore-import", `${collection}.json`);
  const records = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(records)) {
    throw new TypeError(`${filePath} must contain a JSON array.`);
  }

  const ids = new Set();
  return records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError(`${filePath} record ${index + 1} must be a JSON object.`);
    }
    rejectCredentials(record, `${filePath} record ${index + 1}`);
    const id = keyFields.map((field) => record[field]).find((value) =>
      typeof value === "string" || typeof value === "number"
    );
    if (id === undefined || String(id).trim() === "" || String(id).includes("/")) {
      throw new TypeError(`${filePath} record ${index + 1} needs a stable id (${keyFields.join(", ")}).`);
    }
    const documentId = String(id);
    if (ids.has(documentId)) {
      throw new TypeError(`${filePath} contains duplicate document id "${documentId}".`);
    }
    ids.add(documentId);
    return { id: documentId, data: record };
  });
}

async function run() {
  const apply = process.argv.slice(2).includes("--apply");
  const inputs = datasets.map((dataset) => ({
    ...dataset,
    records: readDataset(dataset)
  }));
  for (const input of inputs) {
    console.log(`${input.collection}: ${input.records.length} record(s) validated`);
  }
  if (!apply) {
    console.log("Validation only. Re-run with --apply to write to Firestore.");
    return;
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  }
  const db = admin.firestore();
  const recordsToWrite = [];
  const existingDocuments = [];
  for (const input of inputs) {
    const references = input.records.map(({ id }) => db.collection(input.collection).doc(id));
    for (let start = 0; start < references.length; start += chunkSize) {
      const docs = await Promise.all(
        references.slice(start, start + chunkSize).map((reference) => reference.get())
      );
      docs.forEach((doc) => {
        if (doc.exists) existingDocuments.push(`${input.collection}/${doc.id}`);
      });
    }
    recordsToWrite.push(input);
  }

  if (existingDocuments.length > 0) {
    throw new Error(
      `Firestore already contains ${existingDocuments.length} requested document ID(s); no records were written.`
    );
  }

  for (const input of recordsToWrite) {
    for (let start = 0; start < input.records.length; start += chunkSize) {
      const batch = db.batch();
      for (const record of input.records.slice(start, start + chunkSize)) {
        batch.create(db.collection(input.collection).doc(record.id), record.data);
      }
      await batch.commit();
    }
    console.log(`${input.collection}: imported ${input.records.length} record(s)`);
  }
}

run().catch((error) => {
  console.error(`Firestore import failed: ${error.message}`);
  process.exitCode = 1;
});
