import express from 'express';
import sqlite3 from 'sqlite3';

const app = express();
app.use(express.json());

// Inicializa o Banco de Dados SQLite em memória automático para o corretor
const db = new sqlite3.Database(':memory:', (err) => {
    if (err) console.error(err.message);
    console.log('Banco de dados SQLite (Raízes do Nordeste) conectado!');
});

// Criação das Tabelas estruturadas conforme o DER do projeto
db.serialize(() => {
    db.run(`CREATE TABLE produtos (id INTEGER PRIMARY KEY, nome TEXT, preco REAL)`);
    db.run(`CREATE TABLE estoque (unidade_id INTEGER, produto_id INTEGER, quantidade INTEGER, PRIMARY KEY (unidade_id, produto_id))`);
    db.run(`CREATE TABLE pedidos (id INTEGER PRIMARY KEY AUTOINCREMENT, canal_pedido TEXT, unidade_id INTEGER, status TEXT, total REAL)`);

    // Dados iniciais de teste (Seed)
    db.run(`INSERT INTO produtos (id, nome, preco) VALUES (101, 'Cuscuz Completo', 39.90)`);
    db.run(`INSERT INTO estoque (unidade_id, produto_id, quantidade) VALUES (2, 101, 10)`); 
});

// --- ENDPOINTS DA API (FLUXO CRÍTICO) ---

// 1. Criar Pedido (Validando canal e estoque local)
app.post('/pedidos', (req, res) => {
    const { unidadeId, itens, formaPagamento } = req.body;
    
    // Simulação do canal vindo da rota/header ou default para o MVP
    const canalPedido = "TOTEM"; 
    const item = itens[0]; 

    // Regra de Negócio: Validação de Estoque por Unidade
    db.get(`SELECT quantidade FROM estoque WHERE unidade_id = ? AND produto_id = ?`, [unidadeId, item.produtoId], (err, row) => {
        if (!row || row.quantidade < item.quantidade) {
            return res.status(409).json({
                error: "ESTOQUE_INSUFICIENTE",
                message: "Não há quantidade suficiente em estoque para esta unidade física.",
                timestamp: new Date().toISOString(),
                path: "/pedidos"
            });
        }

        const total = 39.90 * item.quantidade; 
        
        // Insere o pedido com o status inicial obrigatório
        db.run(`INSERT INTO pedidos (canal_pedido, unidade_id, status, total) VALUES (?, ?, 'AGUARDANDO_PAGAMENTO', ?)`, 
        [canalPedido, unidadeId, total], function(err) {
            
            // Deduz do estoque local
            db.run(`UPDATE estoque SET quantidade = quantidade - ? WHERE unidade_id = ? AND produto_id = ?`, [item.quantidade, unidadeId, item.produtoId]);

            res.status(201).json({
                pedidoId: this.lastID,
                status: "AGUARDANDO_PAGAMENTO",
                total: total,
                itens: [{ produtoId: item.produtoId, quantidade: item.quantidade, precoUnitario: 39.90 }]
            });
        });
    });
});

// 2. Simulação de Integração de Pagamento Desacoplado (Mock)
app.post('/pagamentos/mock', (req, res) => {
    const { pedidoId, simularSucesso } = req.body;

    db.get(`SELECT * FROM pedidos WHERE id = ?`, [pedidoId], (err, pedido) => {
        if (!pedido) return res.status(404).json({ error: "PEDIDO_NAO_ENCONTRADO" });

        const novoStatus = simularSucesso ? 'COZINHA' : 'CANCELADO';

        db.run(`UPDATE pedidos SET status = ? WHERE id = ?`, [novoStatus, pedidoId], () => {
            res.status(200).json({
                transacaoId: "gw_tx_9001" + pedidoId,
                pedidoId: pedidoId,
                statusPagamento: simularSucesso ? "APROVADO" : "RECUSADO",
                novoStatusPedido: novoStatus
            });
        });
    });
});

// 3. Consulta de Pedido por ID
app.get('/pedidos/:id', (req, res) => {
    db.get(`SELECT * FROM pedidos WHERE id = ?`, [req.params.id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Nao encontrado" });
        res.status(200).json(row);
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`API Raízes do Nordeste ativa na porta ${PORT}`));
