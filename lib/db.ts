import { Collection, MongoClient } from "mongodb";
import { Scape, Template } from "./mock-data";

export type StoredScape = Scape & { createdAt: Date; updatedAt?: Date };

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "deepscapes";
export const databaseEnabled = Boolean(uri);

let clientPromise: Promise<MongoClient> | undefined;

async function getClient() {
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) clientPromise = new MongoClient(uri).connect();
  return clientPromise;
}

export async function getScapesCollection(): Promise<Collection<StoredScape>> {
  const mongo = await getClient();
  const collection = mongo.db(databaseName).collection<StoredScape>("scapes");
  await collection.createIndex({ id: 1 }, { unique: true });
  return collection;
}

export async function getTemplatesCollection(): Promise<Collection<Template>> {
  const mongo = await getClient();
  const collection = mongo.db(databaseName).collection<Template>("templates");
  await collection.createIndex({ name: 1 }, { unique: true });
  return collection;
}
