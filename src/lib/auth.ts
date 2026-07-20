const PIN_ITERATIONS =
  100_000;

const PASSWORD_ITERATIONS =
  100_000;

const SECRET_SALT_LENGTH =
  16;

const HASH_LENGTH_BITS =
  256;

const SESSION_TOKEN_LENGTH =
  32;

/*
 * Convierte bytes a Base64.
 */
function bytesToBase64(
  bytes: Uint8Array,
): string {
  let binary = "";

  for (const byte of bytes) {
    binary +=
      String.fromCharCode(
        byte,
      );
  }

  return btoa(binary);
}

/*
 * Convierte Base64 a bytes.
 */
function base64ToBytes(
  value: string,
): Uint8Array<ArrayBuffer> {
  const binary =
    atob(value);

  const buffer =
    new ArrayBuffer(
      binary.length,
    );

  const bytes =
    new Uint8Array(
      buffer,
    );

  for (
    let index = 0;
    index < binary.length;
    index += 1
  ) {
    bytes[index] =
      binary.charCodeAt(
        index,
      );
  }

  return bytes;
}

/*
 * Convierte bytes a Base64
 * compatible con URLs.
 */
function bytesToBase64Url(
  bytes: Uint8Array,
): string {
  return bytesToBase64(
    bytes,
  )
    .replace(
      /\+/g,
      "-",
    )
    .replace(
      /\//g,
      "_",
    )
    .replace(
      /=+$/g,
      "",
    );
}

/*
 * Comparación que no termina
 * anticipadamente ante una diferencia.
 */
function constantTimeEqual(
  firstValue: string,
  secondValue: string,
): boolean {
  if (
    firstValue.length !==
    secondValue.length
  ) {
    return false;
  }

  let difference = 0;

  for (
    let index = 0;
    index < firstValue.length;
    index += 1
  ) {
    difference |=
      firstValue.charCodeAt(
        index,
      ) ^
      secondValue.charCodeAt(
        index,
      );
  }

  return difference === 0;
}

/*
 * Genera una sal aleatoria.
 */
function createSalt(): string {
  const bytes =
    new Uint8Array(
      SECRET_SALT_LENGTH,
    );

  crypto.getRandomValues(
    bytes,
  );

  return bytesToBase64(
    bytes,
  );
}

/*
 * Genera un hash PBKDF2.
 */
async function deriveSecretHash(
  secret: string,
  salt: string,
  iterations: number,
): Promise<string> {
  const encoder =
    new TextEncoder();

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",

      encoder.encode(
        secret,
      ),

      {
        name: "PBKDF2",
      },

      false,

      [
        "deriveBits",
      ],
    );

  const derivedBits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",

        hash: "SHA-256",

        salt:
          base64ToBytes(
            salt,
          ),

        iterations,
      },

      keyMaterial,

      HASH_LENGTH_BITS,
    );

  return bytesToBase64(
    new Uint8Array(
      derivedBits,
    ),
  );
}

/*
 * Crea el hash seguro de un PIN.
 */
export async function hashPin(
  pin: string,
): Promise<{
  hash: string;
  salt: string;
}> {
  const salt =
    createSalt();

  const hash =
    await deriveSecretHash(
      pin,
      salt,
      PIN_ITERATIONS,
    );

  return {
    hash,
    salt,
  };
}

/*
 * Comprueba un PIN.
 */
export async function verifyPin(
  pin: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const calculatedHash =
    await deriveSecretHash(
      pin,
      salt,
      PIN_ITERATIONS,
    );

  return constantTimeEqual(
    calculatedHash,
    expectedHash,
  );
}

/*
 * Crea el hash seguro de una
 * contraseña administrativa.
 */
export async function hashPassword(
  password: string,
): Promise<{
  hash: string;
  salt: string;
}> {
  const salt =
    createSalt();

  const hash =
    await deriveSecretHash(
      password,
      salt,
      PASSWORD_ITERATIONS,
    );

  return {
    hash,
    salt,
  };
}

/*
 * Comprueba una contraseña
 * administrativa.
 */
export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const calculatedHash =
    await deriveSecretHash(
      password,
      salt,
      PASSWORD_ITERATIONS,
    );

  return constantTimeEqual(
    calculatedHash,
    expectedHash,
  );
}

/*
 * Crea un token aleatorio para
 * iniciar una sesión.
 */
export function createSessionToken(): string {
  const bytes =
    new Uint8Array(
      SESSION_TOKEN_LENGTH,
    );

  crypto.getRandomValues(
    bytes,
  );

  return bytesToBase64Url(
    bytes,
  );
}

/*
 * En D1 solamente se guarda
 * el hash del token.
 */
export async function hashSessionToken(
  token: string,
): Promise<string> {
  const encoder =
    new TextEncoder();

  const digest =
    await crypto.subtle.digest(
      "SHA-256",

      encoder.encode(
        token,
      ),
    );

  return bytesToBase64(
    new Uint8Array(
      digest,
    ),
  );
}