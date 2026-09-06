export async function fetchUserDocs(projectId: string, dbId: string, idToken: string, collectionId: string, uid: string, limitNum: number = 5, orderByField?: string, orderDirection: 'ASCENDING' | 'DESCENDING' = 'DESCENDING', arrayContainsField?: string, arrayContainsValue?: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery`;
  
  const filters: any[] = [
    {
      fieldFilter: {
        field: { fieldPath: 'userId' },
        op: 'EQUAL',
        value: { stringValue: uid }
      }
    }
  ];

  if (arrayContainsField && arrayContainsValue) {
    filters.push({
      fieldFilter: {
        field: { fieldPath: arrayContainsField },
        op: 'ARRAY_CONTAINS',
        value: { stringValue: arrayContainsValue }
      }
    });
  }

  const query: any = {
    from: [{ collectionId }],
    where: filters.length === 1 ? filters[0] : {
      compositeFilter: {
        op: 'AND',
        filters: filters
      }
    },
    limit: { value: limitNum }
  };

  if (orderByField) {
    query.orderBy = [{
      field: { fieldPath: orderByField },
      direction: orderDirection
    }];
  }

  const body = {
    structuredQuery: query
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    throw new Error(`Firestore REST error: ${await res.text()}`);
  }
  const data = await res.json();
  return data.filter((d: any) => d.document).map((d: any) => parseFirestoreDocument(d.document));
}

export async function createDoc(projectId: string, dbId: string, idToken: string, collectionId: string, docId: string, data: any) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collectionId}?documentId=${docId}`;
  
  const document = { fields: encodeFirestoreDocument(data) };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(document)
  });

  if (!res.ok) {
    throw new Error(`Firestore REST error: ${await res.text()}`);
  }
  return await res.json();
}

export async function updateDoc(projectId: string, dbId: string, idToken: string, collectionId: string, docId: string, data: any) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collectionId}/${docId}`;
  
  // We should do a PATCH request.
  const document = { name: `projects/${projectId}/databases/${dbId}/documents/${collectionId}/${docId}`, fields: encodeFirestoreDocument(data) };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(document)
  });

  if (!res.ok) {
    throw new Error(`Firestore REST error: ${await res.text()}`);
  }
  return await res.json();
}

function encodeFirestoreDocument(obj: any): any {
  const fields: any = {};
  for (const key in obj) {
    const val = obj[key];
    if (val === null || val === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof val === 'string') {
      fields[key] = { stringValue: val };
    } else if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        fields[key] = { integerValue: val.toString() };
      } else {
        fields[key] = { doubleValue: val };
      }
    } else if (typeof val === 'boolean') {
      fields[key] = { booleanValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = { arrayValue: { values: val.map(v => encodeFirestoreDocument({ temp: v }).temp) } };
    } else if (typeof val === 'object') {
      fields[key] = { mapValue: { fields: encodeFirestoreDocument(val) } };
    }
  }
  return fields;
}

function parseFirestoreDocument(doc: any) {
  const parseValue = (val: any): any => {
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.integerValue !== undefined) return parseInt(val.integerValue, 10);
    if (val.doubleValue !== undefined) return parseFloat(val.doubleValue);
    if (val.booleanValue !== undefined) return val.booleanValue;
    if (val.nullValue !== undefined) return null;
    if (val.arrayValue !== undefined) return (val.arrayValue.values || []).map(parseValue);
    if (val.mapValue !== undefined) {
      const obj: any = {};
      for (const key in val.mapValue.fields) {
        obj[key] = parseValue(val.mapValue.fields[key]);
      }
      return obj;
    }
    return val;
  };
  
  const result: any = {};
  if (doc.fields) {
    for (const key in doc.fields) {
      result[key] = parseValue(doc.fields[key]);
    }
  }
  return result;
}

export async function fetchUserDoc(projectId: string, dbId: string, idToken: string, collectionId: string, docId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collectionId}/${docId}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${idToken}` }
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Firestore REST error: ${await res.text()}`);
  }
  const data = await res.json();
  return parseFirestoreDocument(data);
}
