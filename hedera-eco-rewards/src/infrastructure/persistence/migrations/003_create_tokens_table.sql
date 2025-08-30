-- Create tokens table
CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hedera_token_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    decimals INTEGER NOT NULL DEFAULT 8,
    total_supply BIGINT DEFAULT 0,
    treasury_account_id VARCHAR(50) NOT NULL,
    admin_key VARCHAR(200),
    supply_key VARCHAR(200),
    freeze_key VARCHAR(200),
    wipe_key VARCHAR(200),
    kyc_key VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create token transactions table
CREATE TABLE IF NOT EXISTS token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    from_account_id VARCHAR(50),
    to_account_id VARCHAR(50) NOT NULL,
    amount BIGINT NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- 'mint', 'transfer', 'burn'
    hedera_transaction_id VARCHAR(100) UNIQUE NOT NULL,
    consensus_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create token balances table for caching
CREATE TABLE IF NOT EXISTS token_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    account_id VARCHAR(50) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(token_id, account_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tokens_hedera_token_id ON tokens(hedera_token_id);
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_token_transactions_token_id ON token_transactions(token_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_from_account ON token_transactions(from_account_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_to_account ON token_transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_type ON token_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_token_transactions_timestamp ON token_transactions(consensus_timestamp);
CREATE INDEX IF NOT EXISTS idx_token_balances_account ON token_balances(account_id);
CREATE INDEX IF NOT EXISTS idx_token_balances_token_account ON token_balances(token_id, account_id);

-- Create triggers
CREATE TRIGGER update_tokens_updated_at 
    BEFORE UPDATE ON tokens 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_token_balances_updated_at 
    BEFORE UPDATE ON token_balances 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();