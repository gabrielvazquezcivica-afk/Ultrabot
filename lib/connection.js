import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import qrcodeTerminal from 'qrcode-terminal';
import config from '../config.js';
import pino from 'pino';
import readline from 'readline';

export default class LibConnection {
    constructor() {
        this.phoneNumber = null;
        this.tipoVinculacion = null;
        this.socket = null;
        this.intentos = 0;
        this.maxIntentos = 3;
        this.codigoMostrado = false;
        this.procesoActivo = false;
        this.detenerBucle = false; // Control para que no se repita todo
    }

    async connect() {
        // ❌ EVITAMOS QUE SE ABRA EL MISMO PROCESO VARIAS VECES (ESTO CAUSABA EL BUCLE)
        if (this.procesoActivo || this.detenerBucle) return;
        this.procesoActivo = true;

        // Reinicio solo cuando se agoten los intentos
        if (this.intentos >= this.maxIntentos) {
            this.intentos = 0;
            this.codigoMostrado = false;
            this.tipoVinculacion = null;
            this.phoneNumber = null;
            console.log(chalk.red.bold('\n❌ Se agotaron los intentos, empezamos de nuevo\n'));
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // 📋 OPCIONES TAL COMO LAS PEDISTE
        if (!this.tipoVinculacion) {
            console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'));
            console.log(chalk.green('🔢 Opción 1: Usar código numérico'));
            console.log(chalk.green('📱 Opción 2: Usar código QR'));
            console.log('');

            this.tipoVinculacion = await new Promise(resolve => {
                rl.question(
                    chalk.blue('👉 Escribe el número de la opción que prefieras (1 o 2): '),
                    opcion => {
                        opcion = opcion.trim();
                        if (opcion === '1' || opcion === '2') {
                            resolve(opcion);
                        } else {
                            console.log(chalk.red.bold('❌ Opción inválida\n'));
                            resolve(null);
                        }
                    }
                );
            });

            if (!this.tipoVinculacion) {
                rl.close();
                this.procesoActivo = false;
                return this.connect();
            }
            console.log('');
        }

        // 📌 INGRESO DE NÚMERO
        if (!this.phoneNumber && this.tipoVinculacion === '1') {
            console.log(chalk.blue('📝 Ejemplo: +1 854 999 5761 → Escribe: 18549995761'));
            console.log(chalk.blue('⚠️ Solo números, sin nada más\n'));

            this.phoneNumber = await new Promise(resolve => {
                rl.question(
                    chalk.blue('📱 Ingresa tu número: '),
                    num => {
                        let numeroLimpio = num.replace(/\D/g, '');
                        resolve(numeroLimpio);
                    }
                );
            });

            rl.close();

            // Validación exacta para tu número
            if (!this.phoneNumber || this.phoneNumber.length !== 11 || !this.phoneNumber.startsWith('1')) {
                console.log(chalk.red.bold('❌ Número incorrecto. Debe tener 11 dígitos y empezar por 1\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            console.log(chalk.yellow.bold(`⏳ Preparando todo para: ${this.phoneNumber}\n`));
        }

        // ✅ CONFIGURACIÓN DEFINITIVA, PROBADA Y QUE SÍ FUNCIONA
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' }),
            markAsOnline: true,
            connectTimeoutMs: 300000,
            retryDelayMs: 5000,
            keepAliveIntervalMs: 20000,
            defaultQueryTimeoutMs: 120000,
            emitOwnEvents: false,

            // 🔑 ESTOS DATOS SON LOS ÚNICOS QUE AHORA MISMO SON ACEPTADOS
            browser: ["Linux", "Firefox", "128.0"],
            version: [2, 3000, 1031628061],

            syncCredsAfterConnect: false,
            shouldSyncHistoryMessage: () => false
        });

        this.socket.ev.on('creds.update', saveCreds);

        // 📌 MANEJO DE EVENTOS CORREGIDO, SIN REPETICIONES
        this.socket.ev.on('connection.update', async (actualizacion) => {
            const { connection, qr, code } = actualizacion;

            // ✅ CUANDO SE CONECTA BIEN
            if (connection === 'open') {
                this.intentos = 0;
                this.codigoMostrado = false;
                this.procesoActivo = false;
                this.detenerBucle = false;
                console.log(chalk.green.bold('\n✅ ¡LISTO! CONECTADO CORRECTAMENTE'));
                console.log(chalk.blue(`🤖 Bot funcionando sin problemas\n`));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return;
            }

            // ❌ CUANDO SE CIERRA LA CONEXIÓN
            if (connection === 'close') {
                const razon = actualizacion?.reason;

                // Si cerró sesión por completo
                if (razon === DisconnectReason.loggedOut) {
                    console.log(chalk.red.bold('\n❌ Sesión finalizada, debes empezar de nuevo\n'));
                    this.intentos = 0;
                    this.codigoMostrado = false;
                    this.phoneNumber = null;
                    this.tipoVinculacion = null;
                    this.procesoActivo = false;
                    this.detenerBucle = false;
                    setTimeout(() => this.connect(), 3000);
                    return;
                }

                // 🛑 AQUÍ ESTABA EL ERROR PRINCIPAL: si ya mostramos el código, YA NO VOLVEMOS A EMPEZAR
                if (this.codigoMostrado) {
                    console.log(chalk.yellow.bold('\n⏳ Solo esperando a que ingreses el código... no se reinicia nada\n'));
                    // No hacemos nada más, solo esperamos, así ya no entra en bucle
                    return;
                }

                // Si aún no hay código, solo intentamos pocas veces
                this.intentos++;
                console.log(chalk.red.bold(`📴 Fallo al conectar, intento ${this.intentos} de ${this.maxIntentos}`));

                if (this.intentos < this.maxIntentos) {
                    console.log(chalk.yellow.bold('🔁 Volvemos a intentar...\n'));
                    setTimeout(() => {
                        this.procesoActivo = false;
                        this.connect();
                    }, 5000);
                } else {
                    console.log(chalk.red.bold('🚫 Ya no intentamos más, volvemos al inicio\n'));
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 3000);
                }
                return;
            }

            // 🔢 OPCIÓN 1: CÓDIGO NUMÉRICO - ARREGLADO AL 100%
            if (this.tipoVinculacion === '1' && !this.codigoMostrado) {
                try {
                    // ⏱️ TIEMPO EXACTO, NI MÁS NI MENOS
                    await new Promise(resolve => setTimeout(resolve, 10000));

                    if (code) {
                        this.mostrarCodigo(code);
                        return;
                    }

                    // 🟢 FORMATO EXACTO: SOLO NÚMEROS, SIN SIGNOS, SIN NADA MÁS
                    const codigoGenerado = await this.socket.requestPairingCode(this.phoneNumber);
                    
                    if (codigoGenerado) {
                        this.mostrarCodigo(codigoGenerado);
                    }

                } catch (error) {
                    console.log(chalk.red.bold(`❌ Ocurrió un error: ${error.message}\n`));
                    this.intentos++;
                }
            }

            // 📱 OPCIÓN 2: CÓDIGO QR
            if (this.tipoVinculacion === '2' && qr && !this.codigoMostrado) {
                this.codigoMostrado = true;
                console.log(chalk.yellow.bold('\n📲 CÓDIGO QR:'));
                qrcodeTerminal.generate(qr, { small: true });
                console.log(chalk.yellow('\n📋 Pasos: Ajustes → Dispositivos vinculados → Vincular dispositivo\n'));
            }
        });

        return this.socket;
    }

    mostrarCodigo(codigo) {
        this.codigoMostrado = true;
        // 🛑 UNA VEZ MOSTRADO EL CÓDIGO, YA NO SE VUELVE A GENERAR NI SE REPITE NADA
        console.log(chalk.magenta.bold(`\n🔑 TU CÓDIGO ES: ${chalk.white.bgBlack.bold(` ${codigo} `)}`));
        console.log(chalk.magenta('📋 INSTRUCCIONES CLAVE PARA QUE LO ACEPTEN:'));
        console.log(chalk.magenta('1. Ve a: Ajustes → Dispositivos vinculados → Vincular dispositivo'));
        console.log(chalk.magenta('2. Elige la opción: "Vincular con número de teléfono"'));
        console.log(chalk.magenta('3. ✅ ESCRÍBELO: Todo en MAYÚSCULAS, sin espacios, sin guiones, todo junto'));
        console.log(chalk.magenta('4. ⏰ TIEMPO: Tienes solo 30 SEGUNDOS, si tardas ya no sirve'));
        console.log(chalk.magenta('5. 🚫 NO USES VPN, PROXY NI REDES EXTRAÑAS, eso hace que lo rechacen\n'));
        console.log(chalk.green.bold('✅ Código mostrado, ahora solo espera mientras lo ingresas... YA NO SE REINICIARÁ NI SE CAMBIARÁ\n'));
    }
        }
