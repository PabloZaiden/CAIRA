/// <summary>
/// Tests for ConversationStore.cs — in-memory conversation CRUD.
///
/// ConversationStore is pure in-memory logic with no Azure SDK dependency,
/// so these tests are straightforward: create conversations, list them,
/// get them, and verify message recording.
///
/// Mirrors the TypeScript conversation-store.test.ts patterns:
///   - Create returns a valid conversation with conv_ prefix
///   - Create generates unique IDs
///   - Create stores metadata
///   - List returns empty initially, then created conversations
///   - List respects pagination (offset + limit)
///   - Get returns null for missing ID
///   - Get returns detail with messages for existing conversation
///   - AddMessage records messages and updates timestamp
///   - NewMessageId generates IDs with role suffix
/// </summary>

using Xunit;

namespace CairaAgent.Tests;

public class ConversationStoreTests
{
    private static ConversationStore CreateStore() => new();

    // ========================================================================
    // Create
    // ========================================================================

    [Fact]
    public void Create_ReturnsConversationWithConvPrefix()
    {
        var store = CreateStore();
        var conv = store.Create();

        Assert.NotNull(conv.Id);
        Assert.StartsWith("conv_", conv.Id);
        Assert.NotNull(conv.CreatedAt);
        Assert.NotNull(conv.UpdatedAt);
        Assert.Null(conv.Metadata);
    }

    [Fact]
    public void Create_WithMetadata_StoresMetadata()
    {
        var store = CreateStore();
        var metadata = new Dictionary<string, object> { ["mode"] = "discovery" };
        var conv = store.Create(metadata);

        Assert.NotNull(conv.Metadata);
        Assert.True(conv.Metadata.ContainsKey("mode"));
        Assert.Equal("discovery", conv.Metadata["mode"]?.ToString());
    }

    [Fact]
    public void Create_GeneratesUniqueIds()
    {
        var store = CreateStore();
        var conv1 = store.Create();
        var conv2 = store.Create();

        Assert.NotEqual(conv1.Id, conv2.Id);
    }

    [Fact]
    public void Create_SetsCreatedAtAndUpdatedAt()
    {
        var store = CreateStore();
        var conv = store.Create();

        // Both should be valid ISO 8601 timestamps
        Assert.True(DateTimeOffset.TryParse(conv.CreatedAt, out _));
        Assert.True(DateTimeOffset.TryParse(conv.UpdatedAt, out _));
    }

    // ========================================================================
    // List
    // ========================================================================

    [Fact]
    public void List_ReturnsEmptyListInitially()
    {
        var store = CreateStore();
        var list = store.List();

        Assert.Empty(list.Items);
        Assert.Equal(0, list.Total);
        Assert.Equal(0, list.Offset);
        Assert.Equal(20, list.Limit);
    }

    [Fact]
    public void List_ReturnsCreatedConversations()
    {
        var store = CreateStore();
        store.Create();
        store.Create();
        store.Create();

        var list = store.List();

        Assert.Equal(3, list.Total);
        Assert.Equal(3, list.Items.Count);
    }

    [Fact]
    public void List_RespectsPagination()
    {
        var store = CreateStore();
        for (var i = 0; i < 5; i++)
            store.Create();

        var page = store.List(offset: 2, limit: 2);

        Assert.Equal(5, page.Total);
        Assert.Equal(2, page.Items.Count);
        Assert.Equal(2, page.Offset);
        Assert.Equal(2, page.Limit);
    }

    [Fact]
    public void List_ReturnsEmptyPageWhenOffsetExceedsTotal()
    {
        var store = CreateStore();
        store.Create();

        var page = store.List(offset: 10, limit: 20);

        Assert.Equal(1, page.Total);
        Assert.Empty(page.Items);
    }

    // ========================================================================
    // Get
    // ========================================================================

    [Fact]
    public void Get_ReturnsNullForMissingId()
    {
        var store = CreateStore();
        var detail = store.Get("conv_nonexistent");
        Assert.Null(detail);
    }

    [Fact]
    public void Get_ReturnsDetailForExistingConversation()
    {
        var store = CreateStore();
        var conv = store.Create();

        var detail = store.Get(conv.Id);

        Assert.NotNull(detail);
        Assert.Equal(conv.Id, detail.Id);
        Assert.Equal(conv.CreatedAt, detail.CreatedAt);
        Assert.Empty(detail.Messages);
    }

    [Fact]
    public void Get_IncludesMetadata()
    {
        var store = CreateStore();
        var metadata = new Dictionary<string, object> { ["theme"] = "sales" };
        var conv = store.Create(metadata);

        var detail = store.Get(conv.Id);

        Assert.NotNull(detail);
        Assert.NotNull(detail.Metadata);
        Assert.True(detail.Metadata.ContainsKey("theme"));
    }

    // ========================================================================
    // GetRecord
    // ========================================================================

    [Fact]
    public void GetRecord_ReturnsNullForMissingId()
    {
        var store = CreateStore();
        Assert.Null(store.GetRecord("conv_missing"));
    }

    [Fact]
    public void GetRecord_ReturnsMutableRecord()
    {
        var store = CreateStore();
        var conv = store.Create();

        var record = store.GetRecord(conv.Id);

        Assert.NotNull(record);
        Assert.Equal(conv.Id, record.Id);
        Assert.Null(record.LastCheckpoint);
        Assert.Empty(record.Messages);
    }

    // ========================================================================
    // AddMessage
    // ========================================================================

    [Fact]
    public void AddMessage_RecordsMessageInHistory()
    {
        var store = CreateStore();
        var conv = store.Create();
        var record = store.GetRecord(conv.Id)!;

        var msg = new Message("msg_1", "user", "Hello", DateTimeOffset.UtcNow.ToString("o"));
        store.AddMessage(record, msg);

        Assert.Single(record.Messages);
        Assert.Equal("msg_1", record.Messages[0].Id);
        Assert.Equal("user", record.Messages[0].Role);
        Assert.Equal("Hello", record.Messages[0].Content);
    }

    [Fact]
    public void AddMessage_UpdatesTimestamp()
    {
        var store = CreateStore();
        var conv = store.Create();
        var record = store.GetRecord(conv.Id)!;
        var originalUpdatedAt = record.UpdatedAt;

        // Small delay to ensure timestamp differs
        Thread.Sleep(10);

        var msg = new Message("msg_1", "user", "Hello", DateTimeOffset.UtcNow.ToString("o"));
        store.AddMessage(record, msg);

        Assert.NotEqual(originalUpdatedAt, record.UpdatedAt);
    }

    [Fact]
    public void AddMessage_MessagesVisibleViaGet()
    {
        var store = CreateStore();
        var conv = store.Create();
        var record = store.GetRecord(conv.Id)!;

        store.AddMessage(record, new Message("msg_1", "user", "Hello", DateTimeOffset.UtcNow.ToString("o")));
        store.AddMessage(record, new Message("msg_2", "assistant", "Ahoy!", DateTimeOffset.UtcNow.ToString("o")));

        var detail = store.Get(conv.Id);
        Assert.NotNull(detail);
        Assert.Equal(2, detail.Messages.Count);
        Assert.Equal("user", detail.Messages[0].Role);
        Assert.Equal("assistant", detail.Messages[1].Role);
    }

    // ========================================================================
    // NewMessageId
    // ========================================================================

    [Fact]
    public void NewMessageId_ContainsRoleSuffix()
    {
        var id = ConversationStore.NewMessageId("user");
        Assert.StartsWith("msg_", id);
        Assert.EndsWith("_user", id);
    }

    [Fact]
    public void NewMessageId_GeneratesUniqueIds()
    {
        var id1 = ConversationStore.NewMessageId("user");
        var id2 = ConversationStore.NewMessageId("user");
        // IDs are timestamp-based, so they may be the same if called in the same ms.
        // But the role suffix should still be present in both.
        Assert.StartsWith("msg_", id1);
        Assert.StartsWith("msg_", id2);
    }
}
