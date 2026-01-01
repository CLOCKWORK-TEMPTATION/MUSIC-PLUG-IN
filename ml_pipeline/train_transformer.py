#!/usr/bin/env python3
"""
SASRec/eSASRec Sequential Transformer Training Pipeline

هذا السكريبت يدرب نموذج Sequential Transformer (SASRec) على بيانات التفاعلات
لتوليد توصيات موسيقية زمنية متقدمة.

Usage:
    python train_transformer.py --epochs 10 --batch_size 128 --max_seq_len 50
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import pytorch_lightning as pl
from pytorch_lightning.callbacks import ModelCheckpoint, EarlyStopping
from sqlalchemy import create_engine


class InteractionDataset(Dataset):
    """Dataset للتفاعلات الموسيقية التسلسلية"""

    def __init__(
        self,
        sequences: List[List[int]],
        max_len: int = 50,
        mask_prob: float = 0.15
    ):
        self.sequences = sequences
        self.max_len = max_len
        self.mask_prob = mask_prob

    def __len__(self) -> int:
        return len(self.sequences)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        seq = self.sequences[idx]

        # Pad or truncate to max_len
        if len(seq) > self.max_len:
            seq = seq[-self.max_len:]

        # Create input (all but last) and target (all but first)
        # For next-item prediction
        input_seq = seq[:-1]
        target_seq = seq[1:]

        # Padding
        pad_len = self.max_len - 1 - len(input_seq)
        if pad_len > 0:
            input_seq = [0] * pad_len + input_seq
            target_seq = [0] * pad_len + target_seq

        return {
            'input_ids': torch.LongTensor(input_seq),
            'labels': torch.LongTensor(target_seq),
            'attention_mask': torch.LongTensor([1 if x != 0 else 0 for x in input_seq])
        }


class SASRecModel(nn.Module):
    """
    Self-Attentive Sequential Recommendation (SASRec)

    Based on: "Self-Attentive Sequential Recommendation" (Kang & McAuley, 2018)
    """

    def __init__(
        self,
        num_items: int,
        embedding_dim: int = 128,
        num_heads: int = 4,
        num_layers: int = 2,
        dropout: float = 0.1,
        max_seq_len: int = 50
    ):
        super().__init__()

        self.num_items = num_items
        self.embedding_dim = embedding_dim

        # Item embedding + position embedding
        self.item_embedding = nn.Embedding(num_items + 1, embedding_dim, padding_idx=0)
        self.position_embedding = nn.Embedding(max_seq_len, embedding_dim)

        # Transformer encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embedding_dim,
            nhead=num_heads,
            dim_feedforward=embedding_dim * 4,
            dropout=dropout,
            activation='gelu',
            batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)

        # Output layer
        self.output_layer = nn.Linear(embedding_dim, num_items + 1)

        self.dropout = nn.Dropout(dropout)

        # Initialize weights
        self._init_weights()

    def _init_weights(self):
        """Xavier initialization"""
        for module in self.modules():
            if isinstance(module, nn.Embedding):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)
            elif isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        Args:
            input_ids: (batch_size, seq_len)
            attention_mask: (batch_size, seq_len)

        Returns:
            logits: (batch_size, seq_len, num_items)
        """
        batch_size, seq_len = input_ids.shape

        # Position indices
        position_ids = torch.arange(seq_len, device=input_ids.device).unsqueeze(0).expand(batch_size, -1)

        # Embeddings
        item_emb = self.item_embedding(input_ids)
        pos_emb = self.position_embedding(position_ids)

        # Combine embeddings
        x = self.dropout(item_emb + pos_emb)

        # Create causal mask (prevent looking ahead)
        causal_mask = torch.triu(
            torch.ones(seq_len, seq_len, device=input_ids.device) * float('-inf'),
            diagonal=1
        )

        # Apply transformer
        x = self.transformer(x, mask=causal_mask, src_key_padding_mask=(attention_mask == 0) if attention_mask is not None else None)

        # Output projection
        logits = self.output_layer(x)

        return logits

    def predict_next(
        self,
        sequence: List[int],
        top_k: int = 20
    ) -> List[Tuple[int, float]]:
        """
        Predict next items given a sequence

        Args:
            sequence: List of item IDs
            top_k: Number of top predictions to return

        Returns:
            List of (item_id, score) tuples
        """
        self.eval()
        with torch.no_grad():
            input_ids = torch.LongTensor([sequence]).to(next(self.parameters()).device)
            logits = self.forward(input_ids)

            # Get last position logits
            last_logits = logits[0, -1, :]

            # Apply softmax
            probs = F.softmax(last_logits, dim=-1)

            # Get top-k
            top_probs, top_indices = torch.topk(probs, k=top_k)

            results = [
                (idx.item(), prob.item())
                for idx, prob in zip(top_indices, top_probs)
                if idx.item() != 0  # Exclude padding
            ]

            return results


class SASRecLightningModule(pl.LightningModule):
    """PyTorch Lightning wrapper for SASRec"""

    def __init__(
        self,
        num_items: int,
        embedding_dim: int = 128,
        num_heads: int = 4,
        num_layers: int = 2,
        dropout: float = 0.1,
        max_seq_len: int = 50,
        learning_rate: float = 1e-3,
        weight_decay: float = 0.01
    ):
        super().__init__()
        self.save_hyperparameters()

        self.model = SASRecModel(
            num_items=num_items,
            embedding_dim=embedding_dim,
            num_heads=num_heads,
            num_layers=num_layers,
            dropout=dropout,
            max_seq_len=max_seq_len
        )

        self.criterion = nn.CrossEntropyLoss(ignore_index=0)

    def forward(self, input_ids, attention_mask=None):
        return self.model(input_ids, attention_mask)

    def training_step(self, batch, batch_idx):
        input_ids = batch['input_ids']
        labels = batch['labels']
        attention_mask = batch['attention_mask']

        logits = self.forward(input_ids, attention_mask)

        # Reshape for loss calculation
        loss = self.criterion(
            logits.view(-1, self.model.num_items + 1),
            labels.view(-1)
        )

        self.log('train_loss', loss, prog_bar=True)
        return loss

    def validation_step(self, batch, batch_idx):
        input_ids = batch['input_ids']
        labels = batch['labels']
        attention_mask = batch['attention_mask']

        logits = self.forward(input_ids, attention_mask)

        loss = self.criterion(
            logits.view(-1, self.model.num_items + 1),
            labels.view(-1)
        )

        self.log('val_loss', loss, prog_bar=True)
        return loss

    def configure_optimizers(self):
        optimizer = torch.optim.AdamW(
            self.parameters(),
            lr=self.hparams.learning_rate,
            weight_decay=self.hparams.weight_decay
        )

        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer,
            mode='min',
            factor=0.5,
            patience=5,
            verbose=True
        )

        return {
            'optimizer': optimizer,
            'lr_scheduler': {
                'scheduler': scheduler,
                'monitor': 'val_loss'
            }
        }


def load_interactions_from_db(db_url: str) -> pd.DataFrame:
    """Load interaction data from PostgreSQL"""
    engine = create_engine(db_url)

    query = """
    SELECT
        external_user_id,
        track_id,
        event_type,
        created_at,
        EXTRACT(EPOCH FROM created_at) as timestamp
    FROM interactions
    WHERE event_type IN ('PLAY', 'LIKE', 'SKIP')
    ORDER BY external_user_id, created_at
    """

    df = pd.read_sql(query, engine)
    return df


def build_item_vocab(df: pd.DataFrame) -> Tuple[Dict[str, int], Dict[int, str]]:
    """Build vocabulary mapping: track_id -> index"""
    unique_tracks = df['track_id'].unique()

    # 0 is reserved for padding
    track_to_idx = {track: idx + 1 for idx, track in enumerate(unique_tracks)}
    idx_to_track = {idx: track for track, idx in track_to_idx.items()}

    return track_to_idx, idx_to_track


def create_user_sequences(
    df: pd.DataFrame,
    track_to_idx: Dict[str, int],
    min_seq_len: int = 3
) -> List[List[int]]:
    """Create sequential data per user"""
    sequences = []

    for user_id, group in df.groupby('external_user_id'):
        # Sort by timestamp
        user_tracks = group.sort_values('timestamp')['track_id'].tolist()

        # Convert to indices
        user_seq = [track_to_idx[t] for t in user_tracks if t in track_to_idx]

        if len(user_seq) >= min_seq_len:
            sequences.append(user_seq)

    return sequences


def train_sasrec(
    db_url: str,
    output_path: str,
    epochs: int = 10,
    batch_size: int = 128,
    max_seq_len: int = 50,
    embedding_dim: int = 128,
    num_heads: int = 4,
    num_layers: int = 2,
    learning_rate: float = 1e-3,
    val_split: float = 0.1
):
    """Main training function"""

    print(f"🎵 Starting SASRec training...")
    print(f"📊 Loading data from database...")

    # Load data
    df = load_interactions_from_db(db_url)
    print(f"✓ Loaded {len(df)} interactions from {df['external_user_id'].nunique()} users")

    # Build vocabulary
    track_to_idx, idx_to_track = build_item_vocab(df)
    num_items = len(track_to_idx)
    print(f"✓ Vocabulary size: {num_items} tracks")

    # Create sequences
    sequences = create_user_sequences(df, track_to_idx, min_seq_len=3)
    print(f"✓ Created {len(sequences)} user sequences")

    # Train/val split
    split_idx = int(len(sequences) * (1 - val_split))
    train_sequences = sequences[:split_idx]
    val_sequences = sequences[split_idx:]

    # Create datasets
    train_dataset = InteractionDataset(train_sequences, max_len=max_seq_len)
    val_dataset = InteractionDataset(val_sequences, max_len=max_seq_len)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=4)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, num_workers=4)

    # Create model
    model = SASRecLightningModule(
        num_items=num_items,
        embedding_dim=embedding_dim,
        num_heads=num_heads,
        num_layers=num_layers,
        max_seq_len=max_seq_len,
        learning_rate=learning_rate
    )

    # Callbacks
    checkpoint_callback = ModelCheckpoint(
        dirpath=Path(output_path).parent,
        filename='sasrec-{epoch:02d}-{val_loss:.4f}',
        monitor='val_loss',
        mode='min',
        save_top_k=3
    )

    early_stop_callback = EarlyStopping(
        monitor='val_loss',
        patience=10,
        mode='min',
        verbose=True
    )

    # Trainer
    trainer = pl.Trainer(
        max_epochs=epochs,
        callbacks=[checkpoint_callback, early_stop_callback],
        accelerator='auto',
        devices=1,
        log_every_n_steps=10,
        val_check_interval=0.5
    )

    # Train
    print(f"🚀 Starting training for {epochs} epochs...")
    trainer.fit(model, train_loader, val_loader)

    # Save final model
    print(f"💾 Saving model to {output_path}...")

    # Save model state + vocabulary
    torch.save({
        'model_state_dict': model.model.state_dict(),
        'track_to_idx': track_to_idx,
        'idx_to_track': idx_to_track,
        'num_items': num_items,
        'hyperparameters': {
            'embedding_dim': embedding_dim,
            'num_heads': num_heads,
            'num_layers': num_layers,
            'max_seq_len': max_seq_len
        }
    }, output_path)

    print(f"✅ Training complete! Model saved to {output_path}")

    return {
        'num_items': num_items,
        'num_sequences': len(sequences),
        'best_val_loss': checkpoint_callback.best_model_score.item()
    }


def main():
    parser = argparse.ArgumentParser(description='Train SASRec Sequential Transformer')
    parser.add_argument('--db-url', type=str, default=os.getenv('DATABASE_URL'), help='Database URL')
    parser.add_argument('--output', type=str, default='/app/apps/ml/data/model.pt', help='Output model path')
    parser.add_argument('--epochs', type=int, default=10, help='Number of epochs')
    parser.add_argument('--batch-size', type=int, default=128, help='Batch size')
    parser.add_argument('--max-seq-len', type=int, default=50, help='Maximum sequence length')
    parser.add_argument('--embedding-dim', type=int, default=128, help='Embedding dimension')
    parser.add_argument('--num-heads', type=int, default=4, help='Number of attention heads')
    parser.add_argument('--num-layers', type=int, default=2, help='Number of transformer layers')
    parser.add_argument('--learning-rate', type=float, default=1e-3, help='Learning rate')
    parser.add_argument('--val-split', type=float, default=0.1, help='Validation split ratio')

    args = parser.parse_args()

    if not args.db_url:
        print("❌ Error: DATABASE_URL not set")
        sys.exit(1)

    # Create output directory
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    # Train
    result = train_sasrec(
        db_url=args.db_url,
        output_path=args.output,
        epochs=args.epochs,
        batch_size=args.batch_size,
        max_seq_len=args.max_seq_len,
        embedding_dim=args.embedding_dim,
        num_heads=args.num_heads,
        num_layers=args.num_layers,
        learning_rate=args.learning_rate,
        val_split=args.val_split
    )

    print(f"\n📈 Training Results:")
    print(f"   - Num Items: {result['num_items']}")
    print(f"   - Num Sequences: {result['num_sequences']}")
    print(f"   - Best Val Loss: {result['best_val_loss']:.4f}")


if __name__ == '__main__':
    main()
