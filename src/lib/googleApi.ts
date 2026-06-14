/**
 * Creates a new Google Document and populates it with text content.
 * 
 * @param title Title of the document to be created.
 * @param content Text content to be written inside the document.
 * @param accessToken The Google OAuth 2.0 access token.
 * @returns Object containing the documentId and its URL.
 */
export async function createGoogleDoc(
  title: string,
  content: string,
  accessToken: string
): Promise<{ documentId: string; documentUrl: string }> {
  // 1. Create a blank Google Document
  const createResponse = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  if (!createResponse.ok) {
    const errData = await createResponse.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to create Google Doc. Status: ${createResponse.status}`
    );
  }

  const docInfo = await createResponse.json();
  const documentId = docInfo.documentId;
  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  // 2. Insert text content at the beginning of the file (index 1)
  const updateResponse = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              text: content,
              location: {
                index: 1,
              },
            },
          },
        ],
      }),
    }
  );

  if (!updateResponse.ok) {
    const errData = await updateResponse.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to write content to Google Doc. Status: ${updateResponse.status}`
    );
  }

  return { documentId, documentUrl };
}
