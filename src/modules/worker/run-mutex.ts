let locked = false;

export async function tryRunWithGlobalMutex<T>(
  work: () => Promise<T>
): Promise<{ acquired: boolean; result?: T }> {
  if (locked) {
    return { acquired: false };
  }

  locked = true;
  try {
    const result = await work();
    return { acquired: true, result };
  } finally {
    locked = false;
  }
}
