-- =========================================================================
-- SQL SCRIPT PARA O SUPABASE (SQL EDITOR)
-- Copia e cola isto no SQL Editor do Supabase para criares a tabela Rankings
-- =========================================================================

-- 1. Criação da Tabela principal
CREATE TABLE rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    licenca INT NOT NULL,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    posicao INT NOT NULL,
    pontos DECIMAL(10,2) NOT NULL,
    data_atualizacao TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint única para garantir que o upsert do bot funciona e não duplica dados
    UNIQUE(licenca, categoria, data_atualizacao) 
);

-- 2. Criação de Indexes de Otimização (Para pesquisas e Dashboard muito rápidos)
CREATE INDEX idx_rankings_licenca ON rankings(licenca);
CREATE INDEX idx_rankings_nome ON rankings(nome);
CREATE INDEX idx_rankings_categoria_data ON rankings(categoria, data_atualizacao DESC);
CREATE INDEX idx_rankings_pontos ON rankings(pontos DESC);


-- 3. Activar o RLS (Row Level Security)
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;

-- 4. Criar Política Pública de Leitura 
-- (Isto permite que a tua aplicação Frontend aceda livremente aos dados para mostrar as tabelas)
CREATE POLICY "Rankings abertos para leitura" 
ON rankings 
FOR SELECT 
TO public 
USING (true);

-- NOTA: Como o bot Node.js usa a SERVICE_ROLE KEY para gravar, 
-- ele contorna o RLS automaticamente. Portanto, não é preciso criar políticas de INSERT!
