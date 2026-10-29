import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

@Injectable()
export class Storage {
  private container() {
    const connection = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const account = process.env.AZURE_STORAGE_ACCOUNT;
    if (!connection && !account) throw new ServiceUnavailableException("Azure Blob Storage não configurado");
    const client = connection ? BlobServiceClient.fromConnectionString(connection) : new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential());
    return client.getContainerClient(process.env.AZURE_STORAGE_CONTAINER ?? "wind-planner");
  }
  async put(key: string, content: Buffer, contentType: string) { await this.container().getBlockBlobClient(key).uploadData(content, { blobHTTPHeaders: { blobContentType: contentType, blobContentDisposition: "attachment" } }); }
  async get(key: string) { return this.container().getBlockBlobClient(key).downloadToBuffer(); }
}