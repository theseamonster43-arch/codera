# Notifications

Each session has a configured 'time to live' (TTL) which must be above 60 seconds (1 minute). When a session is created, it remains active until its time to live is reached.

To receive the result of an age verification, an HTTP endpoint (notification URL) needs to be listening for a JSON payload in the format below through a POST method.

Notifications require HTTPS and will be reattempted if a 200 status code is not received. It is important to acknowledge the notification with a 200 status code to avoid receiving repeat notifications.

Notifications will be sent multiple times for cases where retries or the resume flow are enabled. It may be possible for a user to initially 'fail' a check type, but subsequently pass on a retry.

Notifications will be sent out for each age verification attempt that a user undergoes.

Below is an example payload:

```json
{
  "method": "AGE_ESTIMATION",
  "result": false, // deprecated
  "age": 30,
  "session_key": "69db8ad4-c983-40b3-b95a-a8fa576e70a6",
  "reference_id": "some_reference_id",
  "id": "2480375e-ddc0-4832-9b82-b1d14af5cf75",
  "timestamp": 1613482863,
  "notification_url": "https://mynotification.example.com",
  "evidence_id": "da4070de-3d34-44d7-86d4-7d6fdf547740",
  "state": "FAIL",
  "check_type": "NONE",
  "sequence_number": 1,
  "signature": "some_signature"
}
```

| Field | Value | Description |
| ---- | ---- | ---- |
| method | e.g. AGE_ESTIMATION | The method used to complete the Age verification session. |
| result* | true false | The result is true if the user met the OVER or UNDER criteria, false if not. The result is always true for type of AGE when an age is returned. *This field is is marked for deprecation. Please use the ****state**** instead* |
| age | integer | Returns the actual age if type AGE. Otherwise returns the threshold value. |
| session_key | uuid | The Age verification session ID. |
| reference_id | string | The reference_id submitted to the session create endpoint is returned in this field. |
| id | uuid | Notification ID. |
| timestamp | epoch timestamp | Timestamp for when the notification was sent. |
| notification_url | string | The notification_url submitted to the session create endpoint is returned in this field. |
| evidence_id | uuid | An ID relating to a specific Age verification attempt. |
| state | FAIL COMPLETE ERROR | FAIL - The session has been completed, the user has failed to meet the age threshold. FAIL will be returned only for 'OVER' and 'UNDER' attempts. COMPLETE - The session has been completed, the user has passed the required threshold, or an age has been returned. Always 'COMPLETE' if AGE type is configured. ERROR - We could not provide an age result or calculate the threshold. This may be because the face was not recognised during age estimation, or the ID document could not be processed through Doc Scan. Additional states may be added in future releases, and therefore, mapping methods should contain default values. |
| check_type | PASSIVE | Returns the type of liveness check that was performed in the Age verification session. This is specified as the 'level' at session creation. |
| sequence_number | integer | The attempt number for the current notification. Starts at 1. |
| signature | string | Signed notification payload, which can be verified using the Age verification public key. |

## Verifying the Signature

Within the notification object, Yoti returns a signature, which allows you to verify that the notification originated from Yoti's Age Verification service.

Verifying the signature may be achieved by:

1. Create a JSON string from the notification payload, stripping out `sequence_number` and `signature`. All spaces in this string must be trimmed.
2. Convert the resulting JSON string into bytes by encoding it as UTF-8.
3. Hash these bytes using SHA256 (C# and Go only).
4. Decode the base64-encoded signature to determine its length in bytes and calculate the salt length.
5. RSA-SHA256 verify the byte value of the JSON string from Step 2 (or hash of the bytes from Step 3) against the byte value of the signature in the webhook response, using PSS padding with SHA256 and the calculated salt length.

The public key is at the bottom of this page.

**Note:** Notifications are optional, and our recommendation is to use them when asynchronous age checks (for example, via ID document) are used. For methods that immediately return a result, such as Digital ID & Age estimation, the session result may be fetched from the [results](https://developers.yoti.com/age-verification/results) endpoint.

### Example code

```javascript
const crypto = require("crypto");
const fs = require('fs');

// Load the public key from a local file
const publicKeyPath = 'keys/public-key.pem';
const publicKey = fs.readFileSync(publicKeyPath, 'utf-8');

function verify(publicKey, signature, payload) {
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(payload);

  return verifier.verify(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
    Buffer.from(signature, 'base64')
  );
}

// Notification JSON
const data = { /* your data here */ };

const { sequence_number, signature, ...payload } = data;
const verified = verify(publicKey, signature, JSON.stringify(payload).replace(/\s/g, ''));

console.log('Signature Verified: ', verified);
```

```java
package com.example;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Security;
import java.security.Signature;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.PSSParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.bouncycastle.jce.provider.BouncyCastleProvider;

public class SignatureVerification {
  static {
    Security.addProvider(new BouncyCastleProvider());
  }

  public static void main(String[] args) {
    try {
      // Load the public key from a local file
      String publicKeyPath = "public-key.pem";
      PublicKey publicKey = getPublicKey(publicKeyPath);

      // Notification JSON String
      String jsonData = new String(Files.readAllBytes(Paths.get("notification_payload.json")));

      // Parse the JSON data
      ObjectMapper objectMapper = new ObjectMapper();
      Map<String, Object> data = objectMapper.readValue(jsonData, Map.class);

      // Remove 'sequence_number' and 'signature' from the data
      data.remove("sequence_number");
      String signature = (String) data.remove("signature");

      // Convert the modified JSON data back to a JSON string and remove spaces
      String jsonString = objectMapper.writeValueAsString(data).replace(" ", "");

      // Decode the Base64-encoded signature
      byte[] signatureDecoded = Base64.getDecoder().decode(signature);

      // Determine the signature length in bytes
      int signatureLengthBytes = signatureDecoded.length;

      // Set the digest output length (SHA-256 produces a 32-byte hash)
      int digestOutputLength = 32;

      // Calculate the salt length
      int saltLength = signatureLengthBytes - digestOutputLength - 2;

      // Verify the signature using the public key
      Signature sig = Signature.getInstance("SHA256withRSA/PSS");
      PSSParameterSpec pssSpec = new PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, saltLength, 1);
      sig.setParameter(pssSpec);
      sig.initVerify(publicKey);
      sig.update(jsonString.getBytes());

      boolean isVerified = sig.verify(signatureDecoded);
      System.out.println("Signature Verified: " + isVerified);
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  private static PublicKey getPublicKey(String filename) throws Exception {
    byte[] keyBytes = Files.readAllBytes(Paths.get(filename));
    String publicKeyPEM = new String(keyBytes);
    publicKeyPEM = publicKeyPEM.replace("-----BEGIN PUBLIC KEY-----", "");
    publicKeyPEM = publicKeyPEM.replace("-----END PUBLIC KEY-----", "");
    publicKeyPEM = publicKeyPEM.replaceAll("\\s", "");

    byte[] decoded = Base64.getDecoder().decode(publicKeyPEM);
    X509EncodedKeySpec spec = new X509EncodedKeySpec(decoded);
    KeyFactory kf = KeyFactory.getInstance("RSA");
    return kf.generatePublic(spec);
  }
}
```

```php
<?php

// Include the Composer autoload file
require __DIR__ . '/vendor/autoload.php'; 

// Use the Phpseclib3 library
use phpseclib3\Crypt\RSA;

// Load the public key from a local file
$publicKeyPath = 'keys/public-key.pem';
$publicKey = RSA::loadPublicKey(file_get_contents($publicKeyPath));

// Notification JSON String
$jsonData = '{ ... }';

// Decode the JSON data
$data = json_decode($jsonData, true);

// Remove 'sequence_number' and 'signature' from the data
unset($data['sequence_number']);
$signature = $data['signature'];
unset($data['signature']);

// Convert the modified JSON data back to a JSON string and remove spaces
$jsonString = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$jsonString = str_replace(' ', '', $jsonString);

// Decode the signature
$signatureDecoded = base64_decode($signature);

// Determine the signature length in bytes
$signatureLengthBytes = strlen($signatureDecoded);

// Set the digest output length
$digestOutputLength = 32;

// Calculate the salt length
$saltLength = $signatureLengthBytes - $digestOutputLength - 2;

// Verify the signature using the public key
$verified = $publicKey
    ->withPadding(RSA::SIGNATURE_PSS)
    ->withHash('sha256')
    ->withSaltLength($saltLength)
    ->verify($jsonString, $signatureDecoded);

if ($verified) {
    echo 'Signature Verified: true';
} else {
    echo 'Signature Verified: false';
}
```

```python
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_public_key
import base64
import json

# Load the public key from a local file
public_key_path = 'keys/public-key.pem'
with open(public_key_path, 'rb') as key_file:
    public_key = load_pem_public_key(key_file.read())

def verify(public_key, signature, payload):
    try:
        public_key.verify(
            base64.b64decode(signature),
            payload.encode('utf-8'),
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        return True
    except Exception as e:
        return False

# Notification JSON
data = { ... }

sequence_number = data.pop('sequence_number')
signature = data.pop('signature')
payload = json.dumps(data, separators=(',', ':'))

verified = verify(public_key, signature, payload)

print('Signature Verified: ', verified)
```

```csharp
using System;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Security;
using Org.BouncyCastle.Crypto.Engines;
using Org.BouncyCastle.Crypto.Signers;

public class RsaPssVerifier
{
    public static bool VerifySignature(string publicKeyPem, string webhookResponse)
    {
        try
        {
            JsonNode jsonNode = JsonNode.Parse(webhookResponse);
            
            string signature = jsonNode["signature"].GetValue<string>();
            jsonNode.AsObject().Remove("signature");
            jsonNode.AsObject().Remove("sequence_number");
            
            string messageToVerify = jsonNode.ToJsonString(new JsonSerializerOptions { WriteIndented = false });

            AsymmetricKeyParameter publicKeyParam = PublicKeyFactory.CreateKey(Convert.FromBase64String(GetPublicKeyBytes(publicKeyPem)));
            RsaKeyParameters rsaKeyParameters = (RsaKeyParameters)publicKeyParam;

            // Convert message to bytes
            byte[] messageBytes = Encoding.UTF8.GetBytes(messageToVerify);

            // Create SHA-256 digest
            var digest = new Org.BouncyCastle.Crypto.Digests.Sha256Digest();

            // Calculate salt length
            int emBits = rsaKeyParameters.Modulus.BitLength - 1;
            int emLen = (emBits + 7) / 8;
            int saltLength = emLen - digest.GetDigestSize() - 2;

            PssSigner signer = new PssSigner(new RsaEngine(), digest, saltLength);
            signer.Init(false, rsaKeyParameters);

            signer.BlockUpdate(messageBytes, 0, messageBytes.Length);

            // Verify the signature
            return signer.VerifySignature(Convert.FromBase64String(signature));
        }
        catch (Exception ex)
        {
            // Exception logging
            Console.WriteLine($"An error occurred: {ex.Message}");
            return false;
        }
    }

    private static string GetPublicKeyBytes(string publicKeyPem)
    {
        const string PemHeader = "-----BEGIN PUBLIC KEY-----";
        const string PemFooter = "-----END PUBLIC KEY-----";

        return publicKeyPem
            .Replace(PemHeader, "")
            .Replace(PemFooter, "")
            .Replace("\n", "")
            .Trim();
    }
}

// Usage example:
class Program
{
    static void Main()
    {
        // Public key for Age verification service
        string publicKey = @"-----BEGIN PUBLIC KEY-----
-----END PUBLIC KEY-----";

        // Full webhook response object
        string webhookResponse = @"{ }";

        bool isVerified = RsaPssVerifier.VerifySignature(publicKey, webhookResponse);
        Console.WriteLine($"Signature is {(isVerified ? "valid" : "invalid")}");
    }
}
```

```go
package main

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
)

// Age verification service public key
const publicKey = ``

// Full Webhook response
const message = ``

type Message struct {
	Method          string `json:"method"`
	Result          bool   `json:"result"`
	Age             int    `json:"age"`
	SessionKey      string `json:"session_key"`
	ReferenceID     string `json:"reference_id"`
	ID              string `json:"id"`
	Timestamp       int64  `json:"timestamp"`
	NotificationURL string `json:"notification_url"`
	EvidenceID      string `json:"evidence_id"`
	State           string `json:"state"`
	CheckType       string `json:"check_type"`
	ErrorCode       string `json:"error_code,omitempty"`
}

type Signature struct {
	Signature string `json:"signature"`
}

func main() {
	block, _ := pem.Decode([]byte(publicKey))
	if block == nil {
		panic("failed to parse PEM block containing the key")
	}

	pkixPub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		panic(err.Error())
	}

	publicKey, ok := pkixPub.(*rsa.PublicKey)
	if !ok {
		panic("Pub key is not rsa")
	}

	var msg Message
	var sig Signature

	err = json.Unmarshal([]byte(message), &msg)
	if err != nil {
		panic(err.Error())
	}

	err = json.Unmarshal([]byte(message), &sig)
	if err != nil {
		panic(err.Error())
	}

	p, err := json.Marshal(msg)
	if err != nil {
		panic(err.Error())
	}

	vb, err := base64.StdEncoding.DecodeString(sig.Signature)
	if err != nil {
		panic(err)
	}

	msgHashSum, err := hash(p)
	if err != nil {
		panic(err.Error())
	}

	err = rsa.VerifyPSS(publicKey, crypto.SHA256, msgHashSum, vb, nil)
	if err != nil {
		panic(err.Error())
	}

	fmt.Println("message is verified")
}

func hash(msg []byte) ([]byte, error) {
	msgHash := sha256.New()

	_, err := msgHash.Write(msg)
	if err != nil {
		return nil, err
	}

	msgHashSum := msgHash.Sum(nil)
	return msgHashSum, nil
}
```

```javascript
// Load the public key from a local file
const publicKeyPath = "keys/public-key.pem";
const publicKeyPem = await Deno.readTextFile(publicKeyPath);

// Import public key
const pemContents = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");

const publicKey = await crypto.subtle.importKey(
    "spki",
    Uint8Array.from(atob(pemContents), c => c.charCodeAt(0)),
    { name: "RSA-PSS", hash: "SHA-256" },
    false,
    ["verify"]
);

function verify(publicKey: CryptoKey, signature: string, payload: string) {
    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const saltLength = sigBytes.length - 32 - 2; // signature length - SHA-256 digest (32) - 2

    return crypto.subtle.verify(
        { name: "RSA-PSS", saltLength },
        publicKey,
        sigBytes,
        new TextEncoder().encode(payload)
    );
}

// Notification JSON
const data = JSON.parse(await Deno.readTextFile("payload.json"));

const { sequence_number, signature, ...payload } = data;
const verified = await verify(publicKey, signature, JSON.stringify(payload).replace(/\s/g, ""));

console.log("Signature Verified:", verified);
```

```markdown
-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAune8+8vPz/pQD6IzdWvX
Q66nh/RcywopCI01Wjo6i7vlH2iVOP1oCkgbObe12iMmVXKRiXgMNT6aXIGe6Ggw
dodzAmt3vT1fmrgub7Of6MgJ56ri2uH1O54DTjbnEbEcLXX13teOusZavntrkNpp
x1c8L0Ol41mRvImJeMHM6I16rLhqB/w1m7USMvof/K6GaP+VmmciZTPyZ6IsXxvB
k0ZoqWqrt2xENlg4O6LXMo7eHEiG+edm9uDpbZK1RhiCd6hyDZ/t4bBQNg4misFF
WezQSiUlPwBLRg1AJ3CNrtBzs49BZ30U7WSPUS0Gsq1lhhDtUtJUt4CdkDAfkVY6
2C6aaqKV940GcPFN7MjOeFus3VNJE3zyHVLT8DStuLMXHY+gQBGFOyxN6heZbm7a
Sl9fi7VXlDTlv1jpk4DFMQYF2fpAyomm95GavhllJnDxC2t8ebu0O23B88hPGI3K
kyLtPA8ie6UNmwNqLYpOEN/pwayYw75FcENBDxnWhoe9AgMBAAE=
-----END PUBLIC KEY-----
```

---

[All pages in this documentation](https://developers.yoti.com/llms.txt)
