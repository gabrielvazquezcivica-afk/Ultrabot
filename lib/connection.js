// ✅ Importación compatible con TODAS las versiones
import * as baileys from '@whiskeysockets/baileys';
import chalk from 'chalk';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import readline from 'readline';

process.setMaxListeners(0);
process.removeAllListeners();

export default class LibConnection {
    constructor() {
        this.phoneNumber = null;
        this.tipoVinculacion = null;
        this.socket = null;
        this.intentos = 0;
        this.maxIntentos = 2;
        this.codigoMostrado = false;
        this.procesoActivo = false;
        this.rl = null;

        process.on('unhandledRejection', () => {});
        process.on('uncaughtException', () => {});
    }

    async connect() {
        if (this.procesoActivo) return;
        this.procesoActivo = true;

        if (this.socket) {
            try {
                this.socket.ev?.removeAllListeners();
                this.socket.end?.();
            } catch {}
            this.socket = null;
        }

        if (this.rl) {
            try {
                this.rl.close();
                this.rl.removeAllListeners();
            } catch {}
            this.rl = null;
        }

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

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.rl.setMaxListeners(0);

        if (!this.tipoVinculacion) {
            console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'));
            console.log(chalk.green('🔢 Opción 1: Usar código numérico'));
            console.log(chalk.green('📱 Opción 2: Usar código QR'));
            console.log('');

            this.tipoVinculacion = await new Promise(resolve => {
                this.rl.question(
                    chalk.blue('👉 Escribe el número de la opción que prefieras (1 o 2): '),
                    opcion => resolve(opcion.trim())
                );
            });

            if (!['1', '2'].includes(this.tipoVinculacion)) {
                console.log(chalk.red.bold('❌ Opción inválida\n'));
                this.rl.close();
                this.procesoActivo = false;
                return this.connect();
            }
            console.log('');
        }

        if (!this.phoneNumber && this.tipoVinculacion === '1') {
            console.log(chalk.blue('📝 Ingresa tu número: 18549995761'));
            console.log(chalk.blue('⚠️ Solo números, sin espacios ni signos\n'));

            this.phoneNumber = await new Promise(resolve => {
                this.rl.question(
                    chalk.blue('📱 Tu número: '),
                    num => resolve(num.replace(/\D/g, ''))
                );
            });

            this.rl.close();

            if (this.phoneNumber !== '18549995761') {
                console.log(chalk.red.bold('❌ Número incorrecto\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            console.log(chalk.yellow.bold(`⏳ Preparando conexión...\n`));
        }

        // ✅ LLAMADA COMPATIBLE CON CUALQUIER VERSIÓN INSTALADA
        const { state, saveCreds } = await baileys.useMultiFileAuthState('./auth_info');
        
        // Aquí está el cambio más importante: probamos ambas formas de llamar la función, así nunca falla
        this.socket = typeof baileys.default === 'function' 
            ? baileys.default({
                auth: state,
                syncFullHistory: false,
                logger: pino({ level: 'silent' }),
                markAsOnline: true,
                connectTimeoutMs: 120000,
                retryDelayMs: 10000,
                keepAliveIntervalMs: 30000,
                emitOwnEvents: false,
                syncCredsAfterConnect: false,
                shouldSyncHistoryMessage: () => false,
                browser: ["Windows", "Edge", "128.0.2739.42"],
                version: [2, 3000, 1033893291]
            }) 
            : typeof baileys.makeWASocket === 'function'
                ? baileys.makeWASocket({
                    auth: state,
                    syncFullHistory: false,
                    logger: pino({ level: 'silent' }),
                    markAsOnline: true,
                    connectTimeoutMs: 120000,
                    retryDelayMs: 10000,
                    keepAliveIntervalMs: 30000,
                    emitOwnEvents: false,
                    syncCredsAfterConnect: false,
                    shouldSyncHistoryMessage: () => false,
                    browser: ["Windows", "Edge", "128.0.2739.42"],
                    version: [2, 3000, 1033893291]
                })
                : (() => { throw new Error('No se encontró la función de conexión'); })();

        this.socket.ev.setMaxListeners(0);
        this.socket.ev.on('creds.update', saveCreds);

        this.socket.ev.on('connection.update', async (update) => {
            const { connection, qr, code } = update;

            if (connection === 'open') {
                this.intentos = 0;
                this.codigoMostrado = false;
                this.procesoActivo = false;
                console.log(chalk.green.bold('\n✅ CONECTADO CORRECTAMENTE'));
                console.log(chalk.blue('🤖 Bot listo para usar\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return;
            }

            if (connection === 'close') {
                const motivo = update?.reason;

                if (motivo === baileys.DisconnectReason?.loggedOut || motivo === 'loggedOut') {
                    console.log(chalk.red.bold('\n❌ Sesión finalizada\n'));
                    this.intentos = 0;
                    this.codigoMostrado = false;
                    this.phoneNumber = null;
                    this.tipoVinculacion = null;
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 3000);
                    return;
                }

                if (this.codigoMostrado) {
                    console.log(chalk.yellow.bold('\n⏳ Esperando que ingreses el código...\n'));
                    this.procesoActivo = false;
                    return;
                }

                this.intentos++;
                console.log(chalk.red.bold(`📴 Intento ${this.intentos} de ${this.maxIntentos}`));

                if (this.intentos < this.maxIntentos) {
                    console.log(chalk.yellow.bold('🔁 Volviendo a intentar...\n'));
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 10000);
                } else {
                    console.log(chalk.red.bold('🚫 Límite alcanzado, reiniciando...\n'));
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 4000);
                }
                return;
            }

            if (this.tipoVinculacion === '1' && !this.codigoMostrado) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 15000));

                    if (code) {
                        this.mostrarCodigo(code);
                        return;
                    }

                    const codigoGenerado = await this.socket.requestPairingCode(`+${this.phoneNumber}`);
                    if (codigoGenerado) this.mostrarCodigo(codigoGenerado);

                } catch (err) {
                    console.log(chalk.red.bold(`❌ Error: ${err.message}\n`));
                    this.intentos++;
                }
            }

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
        this.procesoActivo = false;

        console.log('\n' + '═'.repeat(50));
        console.log(chalk.green.bold('✅ CÓDIGO GENERADO'));
        console.log(chalk.magenta.bold(`🔑 TU CÓDIGO: ${codigo}`));
        console.log('═'.repeat(50) + '\n');
        console.log(chalk.blue('📋 INSTRUCCIONES:'));
        console.log('1. Ve a: Ajustes → Dispositivos vinculados → Vincular dispositivo');
        console.log('2. Elige: "Vincular con número de teléfono"');
        console.log('3. Escribe el código TODO EN MAYÚSCULAS, sin espacios');
        console.log('4. ⏰ Tienes menos de 25 segundos, escribe rápido');
        console.log('5. No uses VPN ni conexiones extrañas\n');
    }
                                               }
                    
