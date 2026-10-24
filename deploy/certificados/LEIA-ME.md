# Certificados intermediários

Alguns servidores do governo não enviam a cadeia completa de certificados. O navegador e o Windows completam a cadeia sozinhos; o Linux do servidor, não. Sem isso, o coletor falha com `CERTIFICATE_VERIFY_FAILED`, mesmo com o site sendo legítimo.

Os certificados desta pasta entram no repositório de certificados da imagem dos coletores (`Dockerfile.coletores`). Eles são **públicos**: não são senha nem chave. A verificação TLS continua ligada, porque um intermediário só é aceito se for assinado por uma raiz que o sistema já confia.

| Arquivo | Para quê | De onde veio | SHA-256 | Vale até |
| --- | --- | --- | --- | --- |
| `sectigo-public-server-authentication-ca-ov-r36.crt` | GeoServer da Funai (terras indígenas), que envia só o próprio certificado | `http://crt.sectigo.com/SectigoPublicServerAuthenticationCAOVR36.crt`, o endereço indicado no próprio certificado da Funai (campo "Authority Information Access") | `65:42:D1:76:BE:D5:0F:19:3C:0C:E2:97:AE:44:EC:D8:A0:A8:6B:EC:2E:DE:68:27:69:34:40:59:B4:E7:85:30` | 21/3/2036 |

**Como foi conferido (24/10/2026):** com este intermediário, o certificado de `geoserver.funai.gov.br` passa no `openssl verify` contra as raízes do sistema (Sectigo Public Server Authentication Root R46).

**Quando mexer aqui:** se a Funai trocar de autoridade certificadora e o coletor voltar a falhar com `CERTIFICATE_VERIFY_FAILED`. Nesse caso, veja o emissor e o endereço "CA Issuers" com:

```bash
openssl s_client -connect geoserver.funai.gov.br:443 -servername geoserver.funai.gov.br </dev/null | openssl x509 -noout -issuer -ext authorityInfoAccess
```
