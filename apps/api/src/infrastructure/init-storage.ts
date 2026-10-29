import "dotenv/config";
import { BlobServiceClient } from "@azure/storage-blob";

async function initialize() {
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) throw new Error("Connection string local obrigatória");
  const client = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  await client.getContainerClient(process.env.AZURE_STORAGE_CONTAINER ?? "wind-planner").createIfNotExists();
  console.log("Storage container ready");
}
initialize().catch(error => { console.error(error); process.exitCode = 1; });