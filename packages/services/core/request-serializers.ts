type RequestSerializers =
  typeof import('@services/core/request-serializers.runtime');
export type RequestSerializerName = keyof RequestSerializers;

let serializersPromise: Promise<RequestSerializers> | null = null;

function loadRequestSerializers(): Promise<RequestSerializers> {
  serializersPromise ??= import(
    '@services/core/request-serializers.runtime'
  ).catch((error: unknown) => {
    serializersPromise = null;
    throw error;
  });
  return serializersPromise;
}

export async function serializeRequest(
  name: RequestSerializerName,
  payload: unknown,
): Promise<ReturnType<RequestSerializers[RequestSerializerName]['serialize']>> {
  const serializers = await loadRequestSerializers();
  return serializers[name].serialize(payload);
}
