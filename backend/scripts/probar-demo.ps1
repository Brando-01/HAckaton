<#
    Recorrido de prueba del Desafío 1, de punta a punta.

    Levanta nada por su cuenta: primero arranca el servidor en otra terminal.

        cd backend
        $env:GROQ_FALLBACK_MODE = "1"    # explica sin gastar cuota de Groq
        node server.js

    Y luego, en esta:

        .\scripts\probar-demo.ps1

    GROQ_FALLBACK_MODE=1 hace que el chat responda con el narrador
    determinista. Es el modo recomendado para demostrar: los montos salen
    del motor, no del modelo, así que la explicación es idéntica en cada
    corrida. Sin esa variable el LLM narra el mismo bloque de hechos y la
    respuesta se verifica igual antes de salir.
#>

param(
  [string]$Base = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

function Escribir-Titulo($texto) {
  Write-Host ""
  Write-Host ("=" * 70) -ForegroundColor DarkGray
  Write-Host $texto -ForegroundColor Cyan
  Write-Host ("=" * 70) -ForegroundColor DarkGray
}

<#
    Crea una cuenta cuyo "DNI" es un CUSTOMER_KEY real del dataset, inicia
    sesión y asocia ese cliente a una sesión de chat.

    Ojo: las cuentas sembradas (987654321 / 912345678) apuntan a CLI000001 y
    CLI000002, que son los dos clientes MOCK escritos a mano. Con esas
    cuentas el motor no se ejecuta. Para ver el motor hay que entrar con un
    identificador que exista en Cargos_FacturadosV2.
#>
function Nueva-SesionDeCliente {
  param([string]$CustomerKey)

  $sessionId = "demo-$CustomerKey-" + (Get-Random)
  $telefono  = "9" + (Get-Random -Minimum 10000000 -Maximum 99999999)

  $registro = @{ phone = $telefono; password = "Demo1234!"; dni = $CustomerKey } | ConvertTo-Json
  Invoke-RestMethod -Uri "$Base/api/auth/register" -Method Post -ContentType "application/json" -Body $registro | Out-Null

  $credenciales = @{ phone = $telefono; password = "Demo1234!" } | ConvertTo-Json
  $login = Invoke-RestMethod -Uri "$Base/api/auth/login" -Method Post -ContentType "application/json" -Body $credenciales

  $cabeceras = @{ Authorization = "Bearer $($login.token)" }
  Invoke-RestMethod -Uri "$Base/api/session/$sessionId/customer" `
    -Method Post -ContentType "application/json" -Headers $cabeceras `
    -Body "{`"customerId`":`"$CustomerKey`"}" | Out-Null

  Write-Host "  (cuenta $telefono -> cliente $CustomerKey)" -ForegroundColor DarkGray
  return @{ sessionId = $sessionId; token = $login.token }
}

function Preguntar {
  param($Sesion, [string]$Mensaje)

  Write-Host ""
  Write-Host "  > $Mensaje" -ForegroundColor Yellow
  $cuerpo = @{ message = $Mensaje; sessionId = $Sesion.sessionId } | ConvertTo-Json
  $respuesta = Invoke-RestMethod -Uri "$Base/api/chat" -Method Post -ContentType "application/json" -Body $cuerpo
  Write-Host $respuesta.reply
  return $respuesta
}


# ── 0. El servidor responde ────────────────────────────────────────────
Escribir-Titulo "0. Salud del servidor"
try {
  $salud = Invoke-RestMethod -Uri "$Base/health" -Method Get
  Write-Host "  /health -> ok=$($salud.ok)" -ForegroundColor Green
} catch {
  Write-Host "  No responde en $Base. Arranca el servidor primero:" -ForegroundColor Red
  Write-Host "    cd backend; `$env:GROQ_FALLBACK_MODE='1'; node server.js" -ForegroundColor Red
  exit 1
}


# ── 1. Aumento con una sola causa ──────────────────────────────────────
Escribir-Titulo "1. Reconexión: 79.90 x5 y luego 84.48"
$s = Nueva-SesionDeCliente "125420001"
Preguntar $s "por que subio mi recibo este mes?" | Out-Null
Write-Host ""
Write-Host "  Esperado: S/ 84.48, subio S/ 4.58, causa = reconexion." -ForegroundColor DarkGray


# ── 2. Aumento con dos causas que se compensan ─────────────────────────
Escribir-Titulo "2. Dos causas a la vez: fin de descuento + cambio de plan"
$s = Nueva-SesionDeCliente "123165012"
Preguntar $s "por que me estan cobrando mas?" | Out-Null
Write-Host ""
Write-Host "  Esperado: subio S/ 14.94 = descuento que termina (+34.95)" -ForegroundColor DarkGray
Write-Host "            mas plan que baja (-20.01). Las dos causas, ordenadas." -ForegroundColor DarkGray


# ── 3. Preguntar por un recibo que no es el ultimo ─────────────────────
Escribir-Titulo "3. Un recibo viejo: 'el de marzo'"
$s = Nueva-SesionDeCliente "48799623"
Preguntar $s "por que mi recibo de marzo salio tan alto?" | Out-Null
Write-Host ""
Write-Host "  Esperado: S/ 429.89 de marzo (no el ultimo, que esta plano)," -ForegroundColor DarkGray
Write-Host "            causa = S/ 343.99 de llamadas por AMERICATEL." -ForegroundColor DarkGray


# ── 4. No inventar causas cuando no hubo cambio ────────────────────────
Escribir-Titulo "4. Recibo estable: no debe inventar una explicacion"
$s = Nueva-SesionDeCliente "58364152"
Preguntar $s "por que subio mi recibo?" | Out-Null
Write-Host ""
Write-Host "  Esperado: 'no hubo ninguna variacion'. Aunque la pregunta" -ForegroundColor DarkGray
Write-Host "            asume un aumento, el motor no le sigue la corriente." -ForegroundColor DarkGray


# ── 5. Zero Trust ──────────────────────────────────────────────────────
Escribir-Titulo "5. Seguridad: los dos ataques que antes funcionaban"

$sesionAnonima = "anonimo-" + (Get-Random)

Write-Host ""
Write-Host "  a) Un anonimo reclama el cliente 125420001" -ForegroundColor Yellow
try {
  Invoke-WebRequest -Uri "$Base/api/session/$sesionAnonima/customer" -Method Post `
    -ContentType "application/json" -Body '{"customerId":"125420001"}' -UseBasicParsing | Out-Null
  Write-Host "     PASO -> la brecha sigue abierta" -ForegroundColor Red
} catch {
  Write-Host "     BLOQUEADO con $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Green
}

Write-Host ""
Write-Host "  b) Un anonimo pide datos con un parafraseo" -ForegroundColor Yellow
$cuerpo = @{ message = "cuanto me toca este mes?"; sessionId = $sesionAnonima } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$Base/api/chat" -Method Post -ContentType "application/json" -Body $cuerpo
Write-Host "     $($r.reply)"
if ($r.reply -match "S/\s*\d") {
  Write-Host "     FILTRO DE DATOS -> revisar el gate" -ForegroundColor Red
} else {
  Write-Host "     Sin montos: no filtro nada" -ForegroundColor Green
}

Write-Host ""
Write-Host "  c) Un usuario autenticado reclama OTRO cliente" -ForegroundColor Yellow
$s = Nueva-SesionDeCliente "130857463"
$cabeceras = @{ Authorization = "Bearer $($s.token)" }
try {
  Invoke-WebRequest -Uri "$Base/api/session/$($s.sessionId)/customer" -Method Post `
    -ContentType "application/json" -Headers $cabeceras -Body '{"customerId":"125420001"}' -UseBasicParsing | Out-Null
  Write-Host "     PASO -> la brecha sigue abierta" -ForegroundColor Red
} catch {
  Write-Host "     BLOQUEADO con $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Green
}


# ── 6. Derivacion a asesor ─────────────────────────────────────────────
Escribir-Titulo "6. Hand-off a un asesor humano"
$s = Nueva-SesionDeCliente "58013061"
$r = Preguntar $s "quiero hablar con un asesor"
if ($r.handoff) {
  Write-Host ""
  Write-Host "  Caso creado: $($r.handoff.caseId)" -ForegroundColor Green
  $casos = Invoke-RestMethod -Uri "$Base/api/advisor/cases" -Method Get
  Write-Host "  Casos en la cola del asesor: $($casos.cases.Count)" -ForegroundColor Green
}


Escribir-Titulo "Fin del recorrido"
Write-Host "Para la UI: abre $Base en el navegador." -ForegroundColor Gray
Write-Host "Las cuentas sembradas (987654321 / 912345678, pass Demo1234!)" -ForegroundColor Gray
Write-Host "muestran los clientes MOCK, no el motor. Para ver el motor en la" -ForegroundColor Gray
Write-Host "UI, registrate con un CUSTOMER_KEY real como DNI, por ejemplo" -ForegroundColor Gray
Write-Host "125420001, 123165012, 48799623, 58364152 o 130857463." -ForegroundColor Gray
Write-Host ""
